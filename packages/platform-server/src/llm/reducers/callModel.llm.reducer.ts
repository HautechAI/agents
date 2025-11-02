import { FunctionTool, HumanMessage, LLM, Reducer, SystemMessage, ToolCallMessage } from '@agyn/llm';
import { LLMResponse, withLLM } from '@agyn/tracing';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { LLMContext, LLMMessage, LLMState } from '../types';
import { LoggerService } from '../../core/services/logger.service';

@Injectable({ scope: Scope.TRANSIENT })
export class CallModelLLMReducer extends Reducer<LLMState, LLMContext> {
  constructor(@Inject(LoggerService) protected logger: LoggerService) {
    super();
  }

  private tools: FunctionTool[] = [];
  private params: { model: string; systemPrompt: string; injectSummary: boolean; summaryMaxTokens: number } = {
    model: '',
    systemPrompt: '',
    injectSummary: true,
    summaryMaxTokens: 512,
  };
  private llm?: LLM;
  private memoryProvider?: (
    ctx: LLMContext,
    state: LLMState,
  ) => Promise<{ msg: SystemMessage | null; place: 'after_system' | 'last_message' } | null>;

  init(params: {
    llm: LLM;
    model: string;
    systemPrompt: string;
    tools: FunctionTool[];
    injectSummary?: boolean;
    summaryMaxTokens?: number;
    memoryProvider?: (
      ctx: LLMContext,
      state: LLMState,
    ) => Promise<{ msg: SystemMessage | null; place: 'after_system' | 'last_message' } | null>;
  }) {
    this.llm = params.llm;
    this.params = {
      model: params.model,
      systemPrompt: params.systemPrompt,
      injectSummary: params.injectSummary ?? true,
      summaryMaxTokens: params.summaryMaxTokens ?? 512,
    };
    this.tools = params.tools || [];
    this.memoryProvider = params.memoryProvider;
    return this;
  }

  async invoke(state: LLMState, _ctx: LLMContext): Promise<LLMState> {
    if (!this.llm || !this.params.model || !this.params.systemPrompt) {
      throw new Error('CallModelLLMReducer not initialized');
    }
    const system = SystemMessage.fromText(this.params.systemPrompt);
    // Optional summary injection as a HumanMessage immediately after the system prompt.
    const summaryText = state.summary && state.summary.trim().length > 0 ? state.summary.trim() : undefined;
    const shouldInjectSummary = !!summaryText && this.params.injectSummary === true;
    // Estimate token cap via ~chars/4 without modifying persisted state.summary
    const maxChars = this.params.summaryMaxTokens * 4;
    const injectedSummaryText = shouldInjectSummary
      ? summaryText!.length > maxChars
        ? summaryText!.slice(0, maxChars)
        : summaryText!
      : undefined;
    // Prevent duplicate injection if same text already exists as a HumanMessage in state.messages
    const isDuplicateSummary = injectedSummaryText
      ? state.messages.some((m) => m instanceof HumanMessage && m.text === injectedSummaryText)
      : false;
    const summaryMsg = shouldInjectSummary && !isDuplicateSummary ? HumanMessage.fromText(injectedSummaryText!) : null;

    const inputBase: (SystemMessage | LLMMessage)[] = summaryMsg ? [system, summaryMsg, ...state.messages] : [system, ...state.messages];
    const mem = this.memoryProvider ? await this.memoryProvider(_ctx, state) : null;
    let input: (SystemMessage | LLMMessage)[] = inputBase;
    if (mem && mem.msg) {
      if (mem.place === 'after_system') {
        // Respect memory placement ordering with optional summary: [System, Human(summary?), System(memory), ...messages]
        input = summaryMsg ? [system, summaryMsg, mem.msg, ...state.messages] : [system, mem.msg, ...state.messages];
      } else {
        // last_message placement: [System, Human(summary?), ...messages, System(memory)]
        input = [...inputBase, mem.msg];
      }
    }

    const response = await withLLM({ context: input.slice(-10) }, async () => {
      try {
        const raw = await this.llm!.call({
          model: this.params.model,
          input,
          tools: this.tools,
        });

        return new LLMResponse({
          raw,
          content: raw.text,
          toolCalls: raw.output.filter((m) => m instanceof ToolCallMessage),
        });
      } catch (error) {
        this.logger.error('Error occurred while calling LLM', error);
        throw error;
      }
    });

    const updated: LLMState = {
      ...state,
      messages: [...state.messages, response],
    };
    return updated;
  }
}
