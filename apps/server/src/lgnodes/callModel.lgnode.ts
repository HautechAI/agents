import { BaseMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { BaseTool } from '../tools/base.tool';
import { BaseNode } from './base.lgnode';
import { NodeOutput } from '../types';
import { withTask } from '@traceloop/node-server-sdk';
import { MemoryConnectorNode } from '../nodes/memoryConnector.node';

export class CallModelNode extends BaseNode {
  private systemPrompt: string = '';
  private memoryConnector?: MemoryConnectorNode;

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

  setMemoryConnector(conn: MemoryConnectorNode): void {
    this.memoryConnector = conn;
  }

  clearMemoryConnector(): void {
    this.memoryConnector = undefined;
  }

  async action(state: { messages: BaseMessage[]; summary?: string }, config: any): Promise<NodeOutput> {
    const tools = this.tools.map((tool) => tool.init(config));

    const boundLLM = this.llm.withConfig({
      tools: tools,
      tool_choice: 'auto',
    });

    const finalMessages: BaseMessage[] = [
      new SystemMessage(this.systemPrompt),
      ...(state.summary ? [new SystemMessage(`Summary of the previous conversation:\n${state.summary}`)] : []),
      ...(state.messages as BaseMessage[]),
    ];

    // Inject memory message if available
    if (this.memoryConnector) {
      const memMsg = await this.memoryConnector.renderMessage(config);
      if (memMsg) {
        const placement = this.memoryConnector.getConfig().placement;
        if (placement === 'after_system') finalMessages.splice(1, 0, memMsg);
        else finalMessages.push(memMsg);
      }
    }

    const result = await withTask({ name: 'llm', inputParameters: [finalMessages.slice(-10)] }, async () => {
      return await boundLLM.invoke(finalMessages, {
        recursionLimit: 250,
      });
    });

    // Return only delta; reducer in state will append
    return { messages: { method: 'append', items: [result] } };
  }
}
