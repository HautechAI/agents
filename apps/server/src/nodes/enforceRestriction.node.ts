import { AIMessage, BaseMessage, SystemMessage } from '@langchain/core/messages';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { NodeOutput } from '../types';
import { BaseNode } from './base.node';

export interface EnforceRestrictionOptions {
  restrictOutput: boolean;
  restrictionMessage: string;
  restrictionMaxInjections: number;
}

export class EnforceRestrictionNode extends BaseNode {
  constructor(private options: EnforceRestrictionOptions) {
    super();
  }

  setOptions(options: Partial<EnforceRestrictionOptions>): void {
    Object.assign(this.options, options);
  }

  async action(
    state: { 
      messages: BaseMessage[]; 
      restrictionInjectionCount?: number;
    }, 
    config: LangGraphRunnableConfig
  ): Promise<NodeOutput> {
    const { restrictOutput, restrictionMessage, restrictionMaxInjections } = this.options;

    // If restrictOutput is disabled, do nothing
    if (!restrictOutput) {
      return {};
    }

    // Check if the last message was an AI message with tool calls
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage instanceof AIMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      return {};
    }

    const currentCount = state.restrictionInjectionCount || 0;

    // Check if we should inject based on max injections
    if (restrictionMaxInjections === 0 || currentCount < restrictionMaxInjections) {
      // Inject restriction message
      const systemMessage = new SystemMessage(restrictionMessage);
      return {
        messages: { method: 'append', items: [systemMessage] },
        restrictionInjectionCount: currentCount + 1,
        restrictionInjected: true,
      };
    } else {
      // Max injections reached, allow finishing
      return {
        restrictionInjected: false,
      };
    }
  }
}