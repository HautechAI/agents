import { FunctionTool, LLM, Reducer, SystemMessage, ToolCallMessage } from '@agyn/llm';
import { LLMResponse, withLLM } from '@agyn/tracing';
import { Injectable, Scope } from '@nestjs/common';
import { LLMContext, LLMState } from '../types';

@Injectable({ scope: Scope.TRANSIENT })
export class CallModelLLMReducer extends Reducer<LLMState, LLMContext> {
  constructor() {
    super();
  }

  private tools: FunctionTool[] = [];
  private params: { model: string; systemPrompt: string } = { model: '', systemPrompt: '' };
  private llm?: LLM;

  init(params: { llm: LLM; model: string; systemPrompt: string; tools: FunctionTool[] }) {
    this.llm = params.llm;
    this.params = { model: params.model, systemPrompt: params.systemPrompt };
    this.tools = params.tools || [];
    return this;
  }

  async invoke(state: LLMState, _ctx: LLMContext): Promise<LLMState> {
    if (!this.llm || !this.params.model || !this.params.systemPrompt) {
      throw new Error('CallModelLLMReducer not initialized');
    }
    const input = [
      SystemMessage.fromText(this.params.systemPrompt), //
      ...state.messages,
    ];

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
        console.error(error);
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
