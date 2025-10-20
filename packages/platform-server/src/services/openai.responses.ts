import OpenAI from 'openai';
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
  private client: OpenAI;
  constructor(private logger = new LoggerService()) {
    const apiKey = process.env.OPENAI_API_KEY;
    this.client = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
  }

  // Map LangChain/BaseMessage[] and tools to Responses API payload
  static toResponsesPayload(messages: BaseMessage[], tools: DynamicStructuredTool[]) {
    const mappedMessages: ResponsesMessage[] = messages.map((m) => {
      const text = String((m as any).content ?? '');
      if (m instanceof SystemMessage) {
        return { role: 'system', content: [{ type: 'input_text', text }] } as ResponsesMessage;
      }
      if (m instanceof HumanMessage) {
        return { role: 'user', content: [{ type: 'input_text', text }] } as ResponsesMessage;
      }
      if (m instanceof AIMessage) {
        const toolCalls: any[] = (m as any).tool_calls || (m as any).toolCalls || [];
        const items: ResponsesMessageContent[] = [];
        if (text) items.push({ type: 'output_text', text });
        for (const tc of toolCalls) {
          const id = tc?.id || tc?.toolCallId || '';
          const name = tc?.name || tc?.toolName || tc?.type || '';
          const input = tc?.args ?? tc?.arguments ?? {};
          if (id && name) items.push({ type: 'tool_use', id, name, input });
        }
        return { role: 'assistant', content: items } as ResponsesMessage;
      }
      if (m instanceof ToolMessage) {
        // Expect tool result content to be string or object
        const tcid = (m as any).tool_call_id || (m as any).toolCallId || (m as any).id || '';
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
        return { role: 'tool', content: [{ type: 'tool_result', tool_use_id: tcid, content }] } as ResponsesMessage;
      }
      // Fallback: treat as system input
      return { role: 'system', content: [{ type: 'input_text', text }] } as ResponsesMessage;
    });

    const mappedTools: ResponsesTool[] = tools.map((t) => {
      const name = (t as any).name || (t as any).schema?.title || 'tool';
      const description = (t as any).description;
      const input_schema: Record<string, unknown> = (t as any).schema || { type: 'object', properties: {} };
      return { type: 'tool', name, description, input_schema } as ResponsesTool;
    });

    return { messages: mappedMessages, tools: mappedTools };
  }

  async createResponse(req: CreateResponseRequest): Promise<ParsedResult> {
    const res = await this.client.responses.create(req as any);
    const parsed = OpenAIResponsesService.parseResponse(res, this.logger);
    return parsed;
  }

  static parseResponse(raw: any, logger = new LoggerService()): ParsedResult {
    const outItems: any[] = Array.isArray(raw?.output) ? raw.output : [];
    let assistantTextParts: string[] = [];
    const toolCalls: Array<{ id: string; name: string; arguments: unknown }> = [];

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
              // Collect reasoning in metadata if needed, but do not throw
              logger.warn?.('Responses reasoning segment without guaranteed adjacent output_text; continuing.');
              break;
            case 'tool_use':
              if (seg.id && seg.name) toolCalls.push({ id: seg.id, name: seg.name, arguments: seg.input });
              break;
            default:
              // Skip unknown types silently or at debug level
              logger.debug?.('Skipping unknown assistant content segment', seg);
          }
        }
      }
      // Ignore non-assistant items at top-level output; tool_result responses are carried via ToolMessage inputs
    }

    const content = assistantTextParts.join('\n');
    const usage = raw?.usage;
    const id = raw?.id;
    return { raw, content, toolCalls, usage, id };
  }
}

