import { DynamicStructuredTool } from "@langchain/core/tools";
import { LangGraphRunnableConfig } from "@langchain/langgraph";

export abstract class BaseTool {
  // Optional logger; default to no-op for tests and bare usage without DI
  protected loggerService: { info: (...args: any[]) => void; debug: (...args: any[]) => void; error: (...args: any[]) => void } = {
    info: () => {},
    debug: () => {},
    error: () => {},
  };
  abstract init(config?: LangGraphRunnableConfig): DynamicStructuredTool;
  async destroy(): Promise<void> { /* default no-op */ }
}
