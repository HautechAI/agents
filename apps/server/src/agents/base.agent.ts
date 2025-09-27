import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { RunnableConfig } from '@langchain/core/runnables';
import { Annotation, AnnotationRoot, CompiledStateGraph, Messages, messagesStateReducer } from '@langchain/langgraph';
import { LoggerService } from '../services/logger.service';
import { TriggerListener, TriggerMessage } from '../triggers/base.trigger';
import { NodeOutput } from '../types';
import { withAgent } from '@traceloop/node-server-sdk';
import type { StaticConfigurable } from '../graph/capabilities';
import { MessagesBuffer } from './messagesBuffer';
import * as z from 'zod';
import { JSONSchema } from 'zod/v4/core';

export abstract class BaseAgent implements TriggerListener, StaticConfigurable {
  protected _graph: CompiledStateGraph<unknown, unknown> | undefined;
  protected _config: RunnableConfig | undefined;
  
  // Agent-side message buffering and scheduling
  private messagesBuffer!: MessagesBuffer;
  private debounceMs: number = 0;
  private whenBusy: 'wait' | 'injectAfterTools' = 'wait';
  private processBuffer: 'allTogether' | 'oneByOne' = 'allTogether';
  private running: Map<string, boolean> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();

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

  constructor(private logger: LoggerService) {
    this.messagesBuffer = new MessagesBuffer({ debounceMs: this.debounceMs });
  }

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
        debounceMs: z.number().int().min(0).default(0).describe('Debounce window in milliseconds for coalescing rapid messages per thread.'),
        whenBusy: z.enum(['wait', 'injectAfterTools']).default('wait').describe('How to handle new messages when agent is busy: wait for completion or inject after tools phase.'),
        processBuffer: z.enum(['allTogether', 'oneByOne']).default('allTogether').describe('Process all buffered messages together or one at a time.'),
      })
      .passthrough();
    return z.toJSONSchema(schema);
  }

  async invoke(thread: string, messages: TriggerMessage[] | TriggerMessage): Promise<BaseMessage | undefined> {
    const batch = Array.isArray(messages) ? messages : [messages];
    this.logger.info(`New trigger event in thread ${thread} with messages: ${JSON.stringify(batch)}`);
    
    // Enqueue messages in buffer
    this.messagesBuffer.enqueue(thread, batch);
    
    // For debounceMs=0 and no running thread, process synchronously for backward compatibility
    if (this.debounceMs === 0 && !this.running.get(thread)) {
      return await this.processThreadSynchronously(thread);
    } else {
      // Trigger async processing for debounced or busy scenarios
      await this.maybeStart(thread);
      return undefined;
    }
  }

  private async processThreadSynchronously(thread: string): Promise<BaseMessage | undefined> {
    if (this.running.get(thread)) {
      return undefined; // Already running
    }
    
    const batch = this.messagesBuffer.tryDrain(thread, this.processBuffer);
    if (batch.length === 0) {
      return undefined;
    }
    
    this.running.set(thread, true);
    try {
      return await this.runTurn(thread, batch);
    } finally {
      this.running.set(thread, false);
      // Continue processing any remaining messages asynchronously
      this.maybeStart(thread).catch(err => {
        this.logger.error(`Error in continued processing for thread ${thread}:`, err);
      });
    }
  }

  private async maybeStart(thread: string): Promise<void> {
    if (this.running.get(thread)) {
      return; // Already running for this thread
    }
    
    await this.startNext(thread);
  }

  private async startNext(thread: string): Promise<void> {
    // Try to drain messages from buffer
    const batch = this.messagesBuffer.tryDrain(thread, this.processBuffer);
    
    if (batch.length === 0) {
      // No messages ready, check if we should schedule for later
      const nextReady = this.messagesBuffer.nextReadyAt(thread);
      if (nextReady) {
        const delay = Math.max(0, nextReady - Date.now());
        const existingTimer = this.timers.get(thread);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
        
        const timer = setTimeout(() => {
          this.timers.delete(thread);
          this.maybeStart(thread).catch(err => {
            this.logger.error(`Error in delayed maybeStart for thread ${thread}:`, err);
          });
        }, delay);
        
        this.timers.set(thread, timer);
      }
      return;
    }

    // Mark thread as running
    this.running.set(thread, true);
    
    try {
      await this.runTurn(thread, batch);
    } finally {
      // Mark thread as not running
      this.running.set(thread, false);
      
      // Check if there are more messages to process
      await this.maybeStart(thread);
    }
  }

  private async runTurn(thread: string, messages: TriggerMessage[]): Promise<BaseMessage | undefined> {
    return await withAgent({ name: 'agent.invoke', inputParameters: [{ thread }, { messages }] }, async () => {
      const response = (await this.graph.invoke(
        {
          messages: { method: 'append', items: messages.map((msg) => new HumanMessage(JSON.stringify(msg))) },
        },
        { ...this.config, configurable: { ...this.config?.configurable, thread_id: thread, caller_agent: this } },
      )) as { messages: BaseMessage[] };
      const lastMessage = response.messages?.[response.messages.length - 1];
      this.logger.info(`Agent response in thread ${thread}: ${lastMessage?.text}`);
      return lastMessage;
    });
  }

  /**
   * For injection after tools - to be called by wrapped ToolsNode.action
   * Returns any pending messages that should be injected into the current turn
   */
  protected drainPendingMessages(thread: string): TriggerMessage[] {
    if (this.whenBusy !== 'injectAfterTools') {
      return [];
    }
    
    // Manually pass current time and ensure we bypass debounce restrictions for immediate injection
    return this.messagesBuffer.tryDrain(thread, this.processBuffer, Date.now() + 1000);
  }

  // New universal teardown hook for graph runtime
  async destroy(): Promise<void> {
    // Clear all timers and cleanup buffer
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.running.clear();
    this.messagesBuffer.destroy();
    
    // default no-op; subclasses can override
  }

  abstract setConfig(_cfg: Record<string, unknown>): void | Promise<void>;

  /**
   * Update agent configuration including new buffering options
   */
  protected updateAgentConfig(config: Record<string, unknown>): void {
    // Handle new agent-side config options
    if (typeof config.debounceMs === 'number' && config.debounceMs >= 0) {
      const oldDebounceMs = this.debounceMs;
      this.debounceMs = config.debounceMs;
      // Only recreate buffer if debounceMs actually changed
      if (oldDebounceMs !== this.debounceMs) {
        this.messagesBuffer.destroy();
        this.messagesBuffer = new MessagesBuffer({ debounceMs: this.debounceMs });
      }
      this.logger.info(`Agent debounceMs updated to ${this.debounceMs}`);
    }
    
    if (config.whenBusy === 'wait' || config.whenBusy === 'injectAfterTools') {
      this.whenBusy = config.whenBusy;
      this.logger.info(`Agent whenBusy updated to ${this.whenBusy}`);
    }
    
    if (config.processBuffer === 'allTogether' || config.processBuffer === 'oneByOne') {
      this.processBuffer = config.processBuffer;
      this.logger.info(`Agent processBuffer updated to ${this.processBuffer}`);
    }
  }
}
