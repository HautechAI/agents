import {
  EasyInputMessage,
  ResponseFunctionCallOutputItemList,
  ResponseFunctionToolCall,
  ResponseInputItem,
  ResponseInputMessageContentList,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseOutputRefusal,
  ResponseOutputText,
  ResponseReasoningItem,
} from 'openai/resources/responses/responses.mjs';

export class LLMUtils {
  static isMessageOutput(output: ResponseOutputItem): output is ResponseOutputMessage {
    return output.type === 'message';
  }

  static isFunctionToolCall(output: ResponseOutputItem): output is ResponseFunctionToolCall {
    return output.type === 'function_call';
  }

  static isReasoningItem(output: ResponseOutputItem): output is ResponseReasoningItem {
    return output.type === 'reasoning';
  }

  static functionToolCall(call_id: string, name: string, args: string): ResponseFunctionToolCall {
    return {
      type: 'function_call',
      call_id,
      name,
      arguments: args,
    } as const;
  }

  static functionToolCallOutput(
    call_id: string,
    output: string | ResponseFunctionCallOutputItemList,
  ): ResponseInputItem.FunctionCallOutput {
    return {
      type: 'function_call_output',
      call_id,
      output,
    } as const;
  }

  static reasoning(id: string, summary: ResponseReasoningItem.Summary[]): ResponseReasoningItem {
    return {
      type: 'reasoning',
      id,
      summary,
    } as const;
  }

  static inputMessage(
    role: 'user' | 'assistant' | 'system' | 'developer',
    content: string | ResponseInputMessageContentList,
  ): EasyInputMessage {
    return {
      type: 'message',
      role,
      content,
    } as const;
  }

  static outputMessage(
    id: string,
    content: Array<ResponseOutputText | ResponseOutputRefusal>,
    status: 'in_progress' | 'completed' | 'incomplete',
  ): ResponseOutputMessage {
    return {
      type: 'message',
      role: 'assistant',
      id,
      content,
      status,
    } as const;
  }
}
