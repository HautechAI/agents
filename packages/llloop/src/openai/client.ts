import type OpenAI from 'openai';
import { type Message } from '../types.js';

export interface CallModelParams {
  client: OpenAI;
  model: string;
  messages: Message[];
  tools?: Array<{ name: string; description?: string; schema: object }>;
  signal?: AbortSignal;
  stream?: boolean;
}

export type CallModelResult = {
  assistant: Message;
  toolCalls: { id: string; name: string; input: unknown }[];
  rawRequest?: unknown;
  rawResponse?: unknown;
};

// Local narrow types to avoid relying on possibly-any SDK internals
type ResponseInputItem = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string };
type ResponseInput = ResponseInputItem[];
type ToolWire = { type: 'function'; function: { name: string; description?: string; parameters: object } };
type ResponseCreateWire = { model: string; input: ResponseInput; tools?: ToolWire[] };

// Minimal transforms from internal message format to OpenAI Responses API input
function toOpenAIContent(messages: Message[]): ResponseInput {
  // Map to role/content pairs; support text-only for initial scaffolding
  const parts: ResponseInput = messages.map((m) => ({
    role: m.role as 'system' | 'user' | 'assistant' | 'tool',
    content: m.contentText ?? (m.contentJson ? JSON.stringify(m.contentJson) : ''),
    name: m.name ?? undefined,
  }));
  return parts;
}

export async function callModel(params: CallModelParams): Promise<CallModelResult> {
  const { client, model, messages, tools, signal, stream } = params;
  const input: ResponseInput = toOpenAIContent(messages);

  // Build tool definitions for Responses tool_choice
  const toolDefs: ToolWire[] | undefined = tools?.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.schema },
  }));

  const reqWire: ResponseCreateWire = { model, input };
  if (toolDefs) reqWire.tools = toolDefs;

  // For initial scaffolding, use non-streaming path; streaming wired later
  const response = await client.responses.create(reqWire as unknown as OpenAI.ResponseCreateParams, { signal });
  let assistant: Message = { role: 'assistant', contentText: '' };
  const toolCalls: { id: string; name: string; input: unknown }[] = [];

  // Extract assistant text and tool calls from Responses output (minimal handling)
  // Note: structure varies; handle text output and tool calls via output[0].
  const outputUnknown: unknown = (response as Record<string, unknown>).output;

  // Custom guard to narrow to unknown[] without using any[]
  const isUnknownArray = (v: unknown): v is unknown[] => Array.isArray(v);

  if (isUnknownArray(outputUnknown) && outputUnknown.length > 0) {
    const firstUnknown: unknown = outputUnknown[0];
    if (firstUnknown && typeof firstUnknown === 'object' && 'type' in firstUnknown) {
      const typeVal = (firstUnknown as Record<string, unknown>).type;
      if (typeVal === 'message') {
        // Collect assistant text
        const contentVal = (firstUnknown as Record<string, unknown>).content;
        if (Array.isArray(contentVal)) {
          const texts: string[] = [];
          for (const c of contentVal) {
            if (c && typeof c === 'object' && 'text' in c) {
              const t = (c as Record<string, unknown>).text;
              if (typeof t === 'string' && t.length > 0) texts.push(t);
            }
          }
          assistant = { role: 'assistant', contentText: texts.join('\n') };
        }
        // Collect tool calls
        const toolCallsVal = (firstUnknown as Record<string, unknown>).tool_calls;
        if (Array.isArray(toolCallsVal)) {
          for (const tc of toolCallsVal) {
            if (tc && typeof tc === 'object') {
              const rec = tc as Record<string, unknown>;
              const idVal = rec.id;
              const fnVal = rec.function;
              let nameStr = 'tool';
              let argsVal: unknown = undefined;
              if (fnVal && typeof fnVal === 'object') {
                const fnRec = fnVal as Record<string, unknown>;
                nameStr = typeof fnRec.name === 'string' ? fnRec.name : 'tool';
                argsVal = fnRec.arguments;
              }
              toolCalls.push({ id: typeof idVal === 'string' ? idVal : `${Date.now()}-${Math.random()}`, name: nameStr, input: argsVal });
            }
          }
        }
      } else if (typeVal === 'output_text') {
        const t = (firstUnknown as Record<string, unknown>).text;
        assistant = { role: 'assistant', contentText: typeof t === 'string' ? t : '' };
      }
    }
  }

  return { assistant, toolCalls, rawRequest: req, rawResponse: response };
}
