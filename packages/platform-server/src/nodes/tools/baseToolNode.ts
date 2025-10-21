import { LLMFunctionTool } from '../../llmloop/base/llmFunctionTool';

export abstract class BaseToolNode {
  abstract getTool(): LLMFunctionTool;
}
