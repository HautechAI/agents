import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { RunnableConfig } from '@langchain/core/runnables';
import { Annotation, AnnotationRoot, CompiledStateGraph } from '@langchain/langgraph';
import { LoggerService } from '../services/logger.service';
import { TriggerListener, TriggerMessage } from '../triggers/base.trigger';
import { NodeOutput } from '../types';
import { withAgent } from '@traceloop/node-server-sdk';
import type { StaticConfigurable } from '../graph/capabilities';
import * as z from 'zod';
import { JSONSchema } from 'zod/v4/core';
import { MessagesBuffer, ProcessBuffer } from './messagesBuffer';

export type WhenBusyMode = 'wait' | 'injectAfterTools';

export abstract class BaseAgent implements TriggerListener, StaticConfigurable {
  protected _graph: CompiledStateGraph<unknown, unknown> | undefined;
  protected _config: RunnableConfig | undefined;
  // Optional static config injected by the runtime; typed loosely on purpose.
  protected _staticConfig: Record<string, unknown> | undefined;

  // Agent-owned trigger buffer and scheduling flags
  protected buffer = new MessagesBuffer({ debounceMs: 0 });
  private whenBusy: WhenBusyMode = 'wait';
  private processBuffer: ProcessBuffer = ProcessBuffer.AllTogether;

  // Per-thread scheduler state
  private threads: Map<
    string,
    { running: boolean; awaiters: Array<(m: BaseMessage | undefined) => void>; timer?: NodeJS.Timeout }
  > = new Map();

  get graph() {
    if (!this._graph) {
      throw new Error('Agent not initialized. Graph is undefined.');
    }
    return this._graph;
  }

  get config() {
    if (!this._config) {
      throw new Error('Agent not initialized. Config is undefined.');
    }
    return this._config;
  }

  constructor(private logger: LoggerService) {}

  protected state(): AnnotationRoot<{}> {
    return Annotation.Root({
      messages: Annotation<BaseMessage[], NodeOutput['messages']>({
        reducer: (left, right) => (!right ? left : right.method === 'append' ? [...left, ...right.items] : right.items),
        default: () => [],
      }),
      summary: Annotation<string, string>({
        reducer: (left, right) => right ?? left,
        default: () => '',
      }),
    });
  }

  protected configuration(): AnnotationRoot<{}> {
    return Annotation.Root({
      // systemPrompt: Annotation<string>(),
    });
  }

  getConfigSchema(): JSONSchema.BaseSchema {
    const schema = z
      .object({
        systemPrompt: z.string().optional(),
        summarizationKeepLast: z.number().int().min(0).optional(),
        summarizationMaxTokens: z.number().int().min(1).optional(),
        debounceMs: z.number().int().min(0).default(0).describe('Debounce window for agent-side buffer.'),
        whenBusy: z
          .enum(['wait', 'injectAfterTools'])
          .default('wait')
          .describe("Agent behavior when a run is active: 'wait' queues, 'injectAfterTools' injects after tools."),
        processBuffer: z
          .enum(['allTogether', 'oneByOne'])
          .default('allTogether')
          .describe("Drain mode for buffer: deliver all queued or one message at a time."),
      })
      .passthrough();
    return z.toJSONSchema(schema);
  }

  /**
   * Allow subclasses to apply runtime scheduling config conveniently.
   */
  protected applyRuntimeConfig(cfg: Record<string, unknown>): void {
    const debounce = (cfg as any).debounceMs;
    const when = (cfg as any).whenBusy as WhenBusyMode | undefined;
    const proc = (cfg as any).processBuffer as 'allTogether' | 'oneByOne' | undefined;
    if (typeof debounce === 'number' && debounce >= 0) this.buffer.setDebounceMs(debounce);
    if (when === 'wait' || when === 'injectAfterTools') this.whenBusy = when;
    if (proc === 'allTogether') this.processBuffer = ProcessBuffer.AllTogether;
    if (proc === 'oneByOne') this.processBuffer = ProcessBuffer.OneByOne;
  }

  async invoke(thread: string, messages: TriggerMessage[] | TriggerMessage): Promise<BaseMessage | undefined> {
    return await withAgent({ name: 'agent.invoke', inputParameters: [{ thread }, { messages }] }, async () => {
      const batch = Array.isArray(messages) ? messages : [messages];
      this.logger.info(`New trigger event in thread ${thread} with messages: ${JSON.stringify(batch)}`);
      this.buffer.enqueue(thread, batch);
      // Return a promise that resolves when the run that processes these messages completes
      const p = new Promise<BaseMessage | undefined>((resolve) => {
        const s = this.ensureThread(thread);
        s.awaiters.push(resolve);
      });
      this.maybeStart(thread);
      const result = await p;
      this.logger.info(`Agent response in thread ${thread}: ${result?.text}`);
      return result;
    });
  }

  // Scheduling helpers
  private ensureThread(thread: string) {
    let s = this.threads.get(thread);
    if (!s) {
      s = { running: false, awaiters: [] };
      this.threads.set(thread, s);
    }
    return s;
  }

  private maybeStart(thread: string) {
    const s = this.ensureThread(thread);
    if (s.running) return;
    const drained = this.buffer.tryDrain(thread, this.processBuffer);
    if (!drained.length) {
      const at = this.buffer.nextReadyAt(thread);
      if (at === undefined) return;
      const delay = Math.max(0, at - Date.now());
      if (s.timer) clearTimeout(s.timer);
      s.timer = setTimeout(() => {
        s.timer = undefined;
        this.startNext(thread);
      }, delay);
      return;
    }
    this.startRun(thread, drained);
  }

  private startNext(thread: string) {
    const s = this.ensureThread(thread);
    if (s.running) return;
    const drained = this.buffer.tryDrain(thread, this.processBuffer);
    if (!drained.length) {
      const at = this.buffer.nextReadyAt(thread);
      if (at === undefined) return;
      const delay = Math.max(0, at - Date.now());
      if (s.timer) clearTimeout(s.timer);
      s.timer = setTimeout(() => {
        s.timer = undefined;
        this.startNext(thread);
      }, delay);
      return;
    }
    this.startRun(thread, drained);
  }

  private async startRun(thread: string, batch: TriggerMessage[]): Promise<void> {
    const s = this.ensureThread(thread);
    s.running = true;
    try {
      const last = await this.runGraph(thread, batch);
      const awaiters = s.awaiters.slice();
      s.awaiters.length = 0;
      for (const res of awaiters) {
        try {
          res(last);
        } catch {
          // ignore
        }
      }
    } finally {
      s.running = false;
      this.startNext(thread);
    }
  }

  private async runGraph(thread: string, batch: TriggerMessage[]): Promise<BaseMessage | undefined> {
    const response = (await this.graph.invoke(
      {
        messages: { method: 'append', items: batch.map((msg) => new HumanMessage(JSON.stringify(msg))) },
      },
      { ...this.config, configurable: { ...this.config?.configurable, thread_id: thread, caller_agent: this } },
    )) as { messages: BaseMessage[] };
    return response.messages?.[response.messages.length - 1];
  }

  // Called by Tools node wrapper to try injection when whenBusy === 'injectAfterTools'
  protected maybeDrainForInjection(thread: string): BaseMessage[] | null {
    if (this.whenBusy !== 'injectAfterTools') return null;
    const drained = this.buffer.tryDrain(thread, this.processBuffer);
    if (!drained.length) return null;
    return drained.map((m) => new HumanMessage(JSON.stringify(m)));
  }

  // New universal teardown hook for graph runtime
  async destroy(): Promise<void> {
    // default no-op; subclasses can override
    this.buffer.destroy();
    // clear timers
    for (const s of this.threads.values()) if (s.timer) clearTimeout(s.timer);
    this.threads.clear();
  }

  abstract setConfig(_cfg: Record<string, unknown>): void | Promise<void>;
}
