import { BaseMessage } from "@langchain/core/messages";
import { LangGraphRunnableConfig } from "@langchain/langgraph";

export abstract class BaseNode {
  constructor() {}

  abstract action(state: unknown, config: LangGraphRunnableConfig): Promise<{ messages: BaseMessage[] }>;
}
