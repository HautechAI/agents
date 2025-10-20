import OpenAI from 'openai';
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { LoggerService } from './logger.service';

type ResponsesTool = {
  type: 'tool';
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

type ResponsesMessageContent =
  | { type: 'input_text'; text: string }
  | { type: 'output_text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: unknown };

type ResponsesMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: ResponsesMessageContent[] };

export type CreateResponseRequest = {
  model: string;
  messages: ResponsesMessage[];
  tools?: ResponsesTool[];
  tool_choice?: 'none' | 'auto';
  metadata?: Record<string, unknown>;
};

export type ParsedResult = {
  raw: unknown;
  content: string;
  toolCalls: Array<{ id: string; name: string; arguments: unknown }>;
  usage?: unknown;
  id?: string;
};

export class OpenAIResponsesService {
  private client?: OpenAI;
  constructor(
    private logger = new LoggerService(),
    private apiKey: string | undefined = process.env.OPENAI_API_KEY,
    private baseURL: string | undefined = process.env.OPENAI_BASE_URL || undefined,
  ) {}

  // Map LangChain/BaseMessage[] and tools to Responses API payload
  static toResponsesPayload(messages: BaseMessage[], tools: Array<DynamicStructuredTool | { name: string; description?: string; schema?: Record<string, unknown> }>) {
    const mappedMessages: ResponsesMessage[] = messages.map((m) => {
      const text = String((m as any).content ?? '');
      const typeHint = (m as any)?._getType?.();
      const roleHint = (m as any)?.role;
      const isSystem = m instanceof SystemMessage || typeHint === 'system' || roleHint === 'system';
      const isUser = m instanceof HumanMessage || typeHint === 'human' || roleHint === 'user';
      const isAI = m instanceof AIMessage || typeHint === 'ai' || roleHint === 'assistant';
      const isTool = m instanceof ToolMessage || typeHint === 'tool' || roleHint === 'tool';

      if (isSystem) {
        return { role: 'system', content: [{ type: 'input_text', text }] };
      }
      if (isUser) {
        return { role: 'user', content: [{ type: 'input_text', text }] };
      }
      if (isAI) {
        const toolCalls: Array<{ id?: string; name?: string; args?: unknown; arguments?: unknown; toolCallId?: string; toolName?: string }> =
          (m as any).tool_calls || (m as any).toolCalls || (m as any)?.additional_kwargs?.tool_calls || [];
        const items: ResponsesMessageContent[] = [];
        if (text) items.push({ type: 'output_text', text });
        for (const tc of toolCalls) {
          const id = tc?.id || tc?.toolCallId;
          const name = tc?.name || tc?.toolName;
          const input = tc?.args ?? tc?.arguments ?? {};
          if (id && name) items.push({ type: 'tool_use', id, name, input });
        }
        return { role: 'assistant', content: items };
      }
      if (isTool) {
        // Expect tool result content to be string or object
        const tcid = (m as any).tool_call_id || (m as any).toolCallId || (m as any).id || undefined;
        if (!tcid) {
          // ToolMessage without a tool_call_id cannot be associated; skip
          (LoggerService.prototype.warn || console.warn).call({} as any, 'ToolMessage missing tool_call_id; skipping tool_result emit');
          return { role: 'tool', content: [] };
        }
        const content: unknown = (() => {
          const c = (m as any).content;
          try {
            if (typeof c === 'string') {
              // Try JSON parse for structured results; fallback to string
              return JSON.parse(c);
            }
          } catch {}
          return c;
        })();
        return { role: 'tool', content: [{ type: 'tool_result', tool_use_id: tcid, content }] };
      }
      // Fallback: treat as system input
      return { role: 'system', content: [{ type: 'input_text', text }] };
    });

    const mappedTools: ResponsesTool[] = tools.map((t) => {
      const name = (t as any).name || (t as any).schema?.title || 'tool';
      const description = (t as any).description;
      const input_schema: Record<string, unknown> = ((t as any).schema || (t as any).input_schema) ?? { type: 'object', properties: {} };
      return { type: 'tool', name, description, input_schema } as ResponsesTool;
    });

    return { messages: mappedMessages, tools: mappedTools };
  }

  async createResponse(req: CreateResponseRequest, opts?: { signal?: AbortSignal }): Promise<ParsedResult> {
    // Lazily create client to avoid instantiation errors when not used (e.g., tests)
    if (!this.client) {
      this.client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseURL });
    }
    // Add explicit tool_choice when tools are specified to ensure tool calling is enabled
    const params: ResponseCreateParamsNonStreaming = {
      ...req,
      tool_choice: req.tools && req.tools.length > 0 ? 'auto' : req.tool_choice,
    };
    const res = await this.client.responses.create(params, { signal: opts?.signal });
    const parsed = OpenAIResponsesService.parseResponse(res, this.logger);
    return parsed;
  }

  static parseResponse(raw: any, logger = new LoggerService()): ParsedResult {
    const outItems: any[] = Array.isArray(raw?.output) ? raw.output : [];
    let assistantTextParts: string[] = [];
    const toolCalls: Array<{ id: string; name: string; arguments: unknown }> = [];

    let warnedReasoning = false;
    for (const item of outItems) {
      if (!item || typeof item !== 'object') continue;
      if (item.type === 'message' && item.role === 'assistant') {
        const contentArray: any[] = Array.isArray(item.content) ? item.content : [];
        for (const seg of contentArray) {
          if (!seg || typeof seg !== 'object') continue;
          switch (seg.type) {
            case 'output_text':
              if (typeof seg.text === 'string' && seg.text.length) assistantTextParts.push(seg.text);
              break;
            case 'reasoning':
              // Do not throw; warn once and continue
              if (!warnedReasoning) {
                warnedReasoning = true;
                logger.warn?.('Responses reasoning segment without guaranteed adjacent output_text; continuing.');
              }
              break;
            case 'tool_use':
              // Always collect tool_use regardless of output_text presence
              if (seg.id && seg.name) toolCalls.push({ id: seg.id, name: seg.name, arguments: seg.input });
              break;
            default:
              // Skip unknown types at debug level
              logger.debug?.('Skipping unknown assistant content segment', seg);
          }
        }
      } else {
        // Unknown or unsupported top-level output item
        logger.debug?.('Skipping unknown top-level output item', item);
      }
    }

    let content = assistantTextParts.join('\n');
    // Fallback: some SDKs populate top-level output_text convenience when only text is present
    if (!content && typeof raw?.output_text === 'string') {
      content = raw.output_text;
    }
    const usage = raw?.usage;
    const id = raw?.id;
    return { raw, content, toolCalls, usage, id };
  }
}
