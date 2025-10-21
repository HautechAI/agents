import {
  EasyInputMessage,
  ResponseFunctionToolCall,
  ResponseInputItem,
  ResponseOutputMessage,
  ResponseReasoningItem,
} from 'openai/resources/responses/responses.mjs';

// export type ResponseInputItem =
//   | EasyInputMessage
//   | ResponseInputItem.Message
//   | ResponseOutputMessage
//   | ResponseFileSearchToolCall
//   | ResponseComputerToolCall
//   | ResponseInputItem.ComputerCallOutput
//   | ResponseFunctionWebSearch
//   | ResponseFunctionToolCall
//   | ResponseInputItem.FunctionCallOutput
//   | ResponseReasoningItem
//   | ResponseInputItem.ImageGenerationCall
//   | ResponseCodeInterpreterToolCall
//   | ResponseInputItem.LocalShellCall
//   | ResponseInputItem.LocalShellCallOutput
//   | ResponseInputItem.McpListTools
//   | ResponseInputItem.McpApprovalRequest
//   | ResponseInputItem.McpApprovalResponse
//   | ResponseInputItem.McpCall
//   | ResponseCustomToolCallOutput
//   | ResponseCustomToolCall
//   | ResponseInputItem.ItemReference;

// export type ResponseOutputItem =
//   | ResponseOutputMessage
//   | ResponseFileSearchToolCall
//   | ResponseFunctionToolCall
//   | ResponseFunctionWebSearch
//   | ResponseComputerToolCall
//   | ResponseReasoningItem
//   | ResponseOutputItem.ImageGenerationCall
//   | ResponseCodeInterpreterToolCall
//   | ResponseOutputItem.LocalShellCall
//   | ResponseOutputItem.McpCall
//   | ResponseOutputItem.McpListTools
//   | ResponseOutputItem.McpApprovalRequest
//   | ResponseCustomToolCall;

///////////

export type LLMMessage =
  | EasyInputMessage
  | ResponseInputItem.Message
  | ResponseOutputMessage
  | ResponseFunctionToolCall
  | ResponseInputItem.FunctionCallOutput
  | ResponseReasoningItem;

export type LLMLoopState = {
  messages: LLMMessage[];
  summary?: string;
};

export type LLMLoopContext = unknown;
