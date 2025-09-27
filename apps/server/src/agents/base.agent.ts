import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { RunnableConfig } from '@langchain/core/runnables';
import { Annotation, AnnotationRoot, CompiledStateGraph, Messages, messagesStateReducer } from '@langchain/langgraph';
import { LoggerService } from '../services/logger.service';
import { TriggerListener, TriggerMessage } from '../triggers/base.trigger';
import { NodeOutput } from '../types';
import { withAgent } from '@traceloop/node-server-sdk';
import type { StaticConfigurable } from '../graph/capabilities';
import * as z from 'zod';
import { JSONSchema } from 'zod/v4/core';
import { MessagesBuffer, WhenBusy, ProcessBuffer } from './messagesBuffer';

export abstract class BaseAgent implements TriggerListener, StaticConfigurable {
  protected _graph: CompiledStateGraph<unknown, unknown> | undefined;
  protected _config: RunnableConfig | undefined;
  protected messagesBuffer: MessagesBuffer;

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
    // Initialize MessagesBuffer with default options
    this.messagesBuffer = new MessagesBuffer(
      this.runGraph.bind(this),
      {
        debounceMs: 0,
        whenBusy: WhenBusy.WAIT,
        processBuffer: ProcessBuffer.ALL_TOGETHER,
      }
    );
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
        // MessagesBuffer configuration
        debounceMs: z.number().int().min(0).default(0).describe('Debounce window in milliseconds for coalescing rapid messages per thread.'),
        whenBusy: z.enum(['wait', 'injectAfterTools']).default('wait').describe('Behavior when agent is busy processing messages.'),
        processBuffer: z.enum(['oneByOne', 'allTogether']).default('allTogether').describe('How to process buffered messages.'),
      })
      .passthrough();
    return z.toJSONSchema(schema);
  }

  async invoke(thread: string, messages: TriggerMessage[] | TriggerMessage): Promise<BaseMessage | undefined> {
    const batch = Array.isArray(messages) ? messages : [messages];
    this.logger.info(`New trigger event in thread ${thread} with messages: ${JSON.stringify(batch)}`);
    
    // Enqueue messages through MessagesBuffer instead of direct execution
    await this.messagesBuffer.enqueue(thread, batch);
    
    // Since buffering is now asynchronous, we can't return the result directly
    // This is a breaking change but aligns with the new architecture
    return undefined;
  }

  /**
   * Internal method to execute the graph for a thread with messages.
   * Called by MessagesBuffer when messages are ready to be processed.
   */
  private async runGraph(thread: string, messages: TriggerMessage[]): Promise<any> {
    return await withAgent({ name: 'agent.invoke', inputParameters: [{ thread }, { messages }] }, async () => {
      const response = (await this.graph.invoke(
        {
          messages: { method: 'append', items: messages.map((msg) => new HumanMessage(JSON.stringify(msg))) },
        },
        { ...this.config, configurable: { ...this.config?.configurable, thread_id: thread } },
      )) as { messages: BaseMessage[] };
      const lastMessage = response.messages?.[response.messages.length - 1];
      this.logger.info(`Agent response in thread ${thread}: ${lastMessage?.text}`);
      return lastMessage;
    });
  }

  /**
   * Called when tools phase completes. Used for injectAfterTools behavior.
   */
  onToolsCompleted(thread: string): void {
    this.messagesBuffer.onToolsPhaseEnd(thread);
  }

  // New universal teardown hook for graph runtime
  async destroy(): Promise<void> {
    // Destroy the messages buffer
    this.messagesBuffer.destroy();
    // default no-op; subclasses can override
  }

  abstract setConfig(_cfg: Record<string, unknown>): void | Promise<void>;

  /**
   * Update MessagesBuffer configuration. Should be called by concrete implementations
   * in their setConfig methods.
   */
  protected updateMessagesBufferConfig(config: Record<string, unknown>): void {
    const bufferFields = ['debounceMs', 'whenBusy', 'processBuffer'];
    const bufferConfig = Object.fromEntries(
      Object.entries(config).filter(([k]) => bufferFields.includes(k))
    );

    if (Object.keys(bufferConfig).length > 0) {
      // Recreate MessagesBuffer with new configuration
      const newOptions = {
        debounceMs: (bufferConfig.debounceMs as number) ?? 0,
        whenBusy: (bufferConfig.whenBusy as WhenBusy) ?? WhenBusy.WAIT,
        processBuffer: (bufferConfig.processBuffer as ProcessBuffer) ?? ProcessBuffer.ALL_TOGETHER,
      };

      // Destroy old buffer and create new one
      this.messagesBuffer.destroy();
      this.messagesBuffer = new MessagesBuffer(this.runGraph.bind(this), newOptions);
      
      this.logger.info('MessagesBuffer configuration updated');
    }
  }
}
