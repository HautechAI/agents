import OpenAI from 'openai';
import {
  ResponseFunctionToolCall,
  ResponseOutputMessage,
  ResponseReasoningItem,
} from 'openai/resources/responses/responses.mjs';
import { LLMFunctionTool } from '../base/llmFunctionTool';

import { LLMUtils } from '../base/llmUtils';
import { LLMReducer } from '../base/llmReducer';
import { LLMLoopState } from '../base/types';

export class CallModelLLMReducer extends LLMReducer {
  constructor(
    private llm: OpenAI,
    private tools: LLMFunctionTool[],
    private params: { model: string; systemPrompt: string },
  ) {
    super();
  }

  filterSupportedOutput(output: OpenAI.Responses.ResponseOutputItem[]) {
    const result: (ResponseOutputMessage | ResponseFunctionToolCall | ResponseReasoningItem)[] = [];
    output.forEach((o) => {
      if (LLMUtils.isMessage(o)) {
        result.push(LLMUtils.outputMessage(o.id, o.content, o.status));
        return;
      }
      if (LLMUtils.isFunctionToolCall(o)) {
        result.push(LLMUtils.functionToolCall(o.call_id, o.name, o.arguments));
        return;
      }
      if (LLMUtils.isReasoningItem(o)) {
        // Ignore reasoning
        // result.push(LLMUtils.reasoning(o.id, o.summary));
        return;
      }

      throw new Error(`Unknown output type: ${o.type}`);
    });
    return result;
  }

  async invoke(state: LLMLoopState): Promise<LLMLoopState> {
    console.log(state.messages);
    const response = await this.llm.responses.create({
      model: this.params.model,
      input: [
        LLMUtils.inputMessage('system', this.params.systemPrompt), //
        ...state.messages,
      ],
      tools: this.tools.map((tool) => tool.definition()),
    });

    const output = this.filterSupportedOutput(response.output);

    return {
      ...state,
      messages: [...state.messages, ...output],
    };
  }
}
