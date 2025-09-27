import { BaseMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { BaseTool } from '../tools/base.tool';
import { BaseNode } from './base.node';
import { NodeOutput } from '../types';
import { withTask } from '@traceloop/node-server-sdk';

export class CallModelNode extends BaseNode {
  private systemPrompt: string = '';

  constructor(
    private tools: BaseTool[],
    private llm: ChatOpenAI,
  ) {
    super();
    // Copy to decouple from external array literal; we manage our own list.
    this.tools = [...tools];
  }

  addTool(tool: BaseTool) {
    if (!this.tools.includes(tool)) this.tools.push(tool);
  }

  removeTool(tool: BaseTool) {
    this.tools = this.tools.filter((t) => t !== tool);
  }

  setSystemPrompt(systemPrompt: string) {
    this.systemPrompt = systemPrompt;
  }

  async action(state: { messages: BaseMessage[]; summary?: string }, config: any): Promise<NodeOutput> {
    const tools = this.tools.map((tool) => tool.init(config));

    const boundLLM = this.llm.withConfig({
      tools: tools,
      tool_choice: 'auto',
    });

    // Agent-controlled injection: after tools complete, allow the caller agent to inject buffered messages
    const injected: BaseMessage[] = (() => {
      const agent: any = (config as any)?.configurable?.caller_agent;
      const threadId = (config as any)?.configurable?.thread_id;
      if (agent && typeof agent['maybeDrainForInjection'] === 'function' && threadId) {
        try {
          const extra = agent['maybeDrainForInjection'](threadId);
          return Array.isArray(extra) ? (extra as BaseMessage[]) : [];
        } catch {
          return [];
        }
      }
      return [];
    })();

    const finalMessages: BaseMessage[] = [
      new SystemMessage(this.systemPrompt),
      ...(state.summary ? [new SystemMessage(`Summary of the previous conversation:\n${state.summary}`)] : []),
      ...(state.messages as BaseMessage[]),
      ...injected,
    ];

    const result = await withTask({ name: 'llm', inputParameters: [finalMessages.slice(-10)] }, async () => {
      return await boundLLM.invoke(finalMessages, {
        recursionLimit: 2500,
      });
    });

    // Persist the injection in state alongside the model response
    return { messages: { method: 'append', items: [...injected, result] } };
  }
}
