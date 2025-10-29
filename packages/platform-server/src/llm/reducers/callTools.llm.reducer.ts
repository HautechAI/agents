import { ToolCallResponse, withToolCall } from '@agyn/tracing';

import { LLMContext, LLMMessage, LLMState } from '../types';
import { FunctionTool, Reducer, ResponseMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import { LoggerService } from '../../core/services/logger.service';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { stringify as YamlStringify } from 'yaml';

@Injectable({ scope: Scope.TRANSIENT })
export class CallToolsLLMReducer extends Reducer<LLMState, LLMContext> {
  constructor(@Inject(LoggerService) private logger: LoggerService) {
    super();
  }

  private tools?: FunctionTool[];

  init(params: { tools: FunctionTool[] }) {
    this.tools = params.tools || [];
    return this;
  }

  filterToolCalls(messages: LLMMessage[]) {
    const result: ToolCallMessage[] = [];

    const m = messages.at(-1);
    if (m instanceof ResponseMessage) {
      m.output.forEach((o) => {
        if (o instanceof ToolCallMessage) {
          result.push(o);
        }
      });
    }

    return result;
  }

  createToolsMap() {
    if (!this.tools) throw new Error('CallToolsLLMReducer not initialized');
    const toolsMap = new Map<string, FunctionTool>();
    this.tools.forEach((t) => toolsMap.set(t.name, t));
    return toolsMap;
  }

  async invoke(state: LLMState, ctx: LLMContext): Promise<LLMState> {
    const toolsToCall = this.filterToolCalls(state.messages);
    const toolsMap = this.createToolsMap();

    const results = await Promise.all(
      toolsToCall.map(async (t) => {
        const tool = toolsMap.get(t.name);
        if (!tool) throw new Error(`Unknown tool called: ${t.name}`);
        const input = tool.schema.parse(JSON.parse(t.args));

        const response = await withToolCall(
          {
            name: tool.name,
            toolCallId: t.callId,
            input,
            nodeId: ctx?.callerAgent?.getAgentNodeId?.(),
          },
          async () => {
            try {
              const raw = await tool.execute(input, ctx);

              if (raw.length > 50000) {
                throw new Error('Tool output exceeds maximum allowed length of 50000 characters.');
              }

              return new ToolCallResponse({
                raw,
                output: raw,
                status: 'success',
              });
            } catch (err: unknown) {
              this.logger.error('Error occurred while executing tool', err);

              if (err instanceof Error) {
                const message = YamlStringify(err.message);
                return new ToolCallResponse({
                  raw: message,
                  output: message,
                  status: 'error',
                });
              }

              return new ToolCallResponse({
                raw: 'Unknown error',
                output: 'Unknown error',
                status: 'error',
              });
            }
          },
        );

        // Emit raw output payload for FunctionCallOutput
        return ToolCallOutputMessage.fromResponse(t.callId, response);
      }),
    );

    // Reset enforcement counters after successful tool execution
    const meta = {
      ...state.meta,
      restrictionInjectionCount: 0,
      restrictionInjected: false,
    };

    return { ...state, messages: [...state.messages, ...results], meta };
  }
}
