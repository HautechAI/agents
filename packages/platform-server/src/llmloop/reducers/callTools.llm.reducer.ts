import { LLMFunctionTool } from '../base/llmFunctionTool';

import { ResponseFunctionToolCall } from 'openai/resources/responses/responses.mjs';
import { LLMReducer } from '../base/llmReducer';
import { LLMUtils } from '../base/llmUtils';
import { LLMLoopContext, LLMLoopState, LLMMessage } from '../base/types';
import { ToolCallResponse, withToolCall } from '@agyn/tracing';

export class CallToolsLLMReducer extends LLMReducer {
  constructor(private tools: LLMFunctionTool[]) {
    super();
  }

  filterToolCalls(messages: LLMMessage[]) {
    const fulfilledCallIds = new Set<string>();
    const result: ResponseFunctionToolCall[] = [];

    messages.forEach((m) => {
      if (m.type === 'function_call_output') {
        fulfilledCallIds.add(m.call_id);
        return;
      }
      if (m.type === 'function_call' && !fulfilledCallIds.has(m.call_id)) {
        result.push(m);
      }
    });
    return result;
  }

  createToolsMap() {
    const toolsMap = new Map<string, LLMFunctionTool>();
    this.tools.forEach((t) => toolsMap.set(t.name, t));
    return toolsMap;
  }

  async invoke(state: LLMLoopState, ctx: LLMLoopContext): Promise<LLMLoopState> {
    const toolsToCall = this.filterToolCalls(state.messages);
    const toolsMap = this.createToolsMap();

    const results = await Promise.all(
      toolsToCall.map(async (t) => {
        const tool = toolsMap.get(t.name);
        if (!tool) throw new Error(`Unknown tool called: ${t.name}`);
        const input = tool.schema.parse(JSON.parse(t.arguments));

        const response = await withToolCall(
          {
            name: tool.name,
            toolCallId: t.call_id,
            input,
          },
          async () => {
            const raw = await tool.execute(input, ctx);
            return new ToolCallResponse({
              raw,
              status: 'success',
            });
          },
        );

        return LLMUtils.functionToolCallOutput(t.call_id, response);
      }),
    );

    return { ...state, messages: [...state.messages, ...results] };
  }
}
