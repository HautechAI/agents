import OpenAI from 'openai';
import { withSummarize, SummarizeResponse } from '@agyn/tracing';
import { LLMReducer } from '../base/llmReducer';
import { LLMLoopContext, LLMLoopState, LLMMessage } from '../base/types';
import { LLMUtils } from '../base/llmUtils';
import { stringify } from 'yaml';

// Map an LLMMessage (OpenAI responses API shapes) into tracing ChatMessageInput-ish objects
// We only need role + content + tool call correlations for summarization context.
function toTracingChatMessage(msg: LLMMessage): any {
  // Messages
  if (msg.type === 'message') {
    const role = msg.role || 'assistant';
    // content for input messages is a string or list; normalize to string for summarization
    const c =
      typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.map((p) => (p.type === 'input_text' || p.type === 'output_text' ? p.text : '')).join('\n')
          : JSON.stringify(msg.content);
    return { role: role === 'assistant' ? 'ai' : role, content: c };
  }
  // Function call tool invocation
  if (msg.type === 'function_call') {
    return {
      role: 'ai',
      content: msg.name + ':' + (msg.arguments || ''),
      toolCalls: [
        {
          id: msg.call_id || 'call',
          name: msg.name,
          arguments: msg.arguments,
        },
      ],
    };
  }
  // Function call output -> tool message
  if (msg.type === 'function_call_output') {
    const output = msg.output;
    const text = typeof output === 'string' ? output : JSON.stringify(output);
    return { role: 'tool', toolCallId: msg.call_id, content: text };
  }
  // Reasoning items -> treat as system meta to preserve info minimally
  if (msg.type === 'reasoning') {
    return { role: 'system', content: JSON.stringify(msg.summary || {}) };
  }
  return { role: 'system', content: JSON.stringify(msg) };
}

/**
 * Summarization reducer ports logic from SummarizationNode for folding older context
 * into a running summary while keeping a verbatim tail constrained by a token budget.
 */
export class SummarizationLLMReducer extends LLMReducer {
  constructor(
    private llm: OpenAI,
    private params: { model: string; keepTokens: number; maxTokens: number; summarySystemNote?: string },
  ) {
    super();
  }

  // Token counting for raw string summary text.
  private countTokensFromString(text: string): number {
    return text.length;
  }

  // Token counting for arrays of LLMMessage objects.
  private async countTokensFromMessages(messages: LLMMessage[]): Promise<number> {
    const contents = messages.map((m) => {
      return JSON.stringify(m);
    });
    return contents.reduce((acc, cur) => acc + cur.length, 0);
  }

  /**
   * Group messages: assistant function_call grouped with subsequent function_call_output items.
   * We rely on shape from OpenAI responses API: type === 'function_call' / 'function_call_output'.
   */
  private groupMessages(messages: LLMMessage[]): LLMMessage[][] {
    const groups: LLMMessage[][] = [];
    let i = 0;
    while (i < messages.length) {
      const m = messages[i];
      if (m.type === 'function_call') {
        const group: LLMMessage[] = [m];
        i++;
        while (i < messages.length) {
          const next = messages[i];
          if (next.type === 'function_call_output' && next.call_id === m.call_id) {
            group.push(next);
            i++;
            continue;
          }
          break;
        }
        groups.push(group);
        continue;
      }
      if (m.type === 'function_call_output') {
        // Orphan output without preceding call -> ignore
        i++;
        continue;
      }
      groups.push([m]);
      i++;
    }
    return groups;
  }

  private async groupsTokenCounts(groups: LLMMessage[][]): Promise<number[]> {
    return Promise.all(groups.map((g) => this.countTokensFromMessages(g)));
  }

  private async shouldSummarize(state: LLMLoopState): Promise<boolean> {
    const { maxTokens } = this.params;
    if (!(maxTokens > 0)) return false;
    const groups = this.groupMessages(state.messages);
    if (groups.length <= 1) return false;
    const messagesTokens = await this.countTokensFromMessages(state.messages);
    const summaryTokens = state.summary ? this.countTokensFromString(state.summary) : 0;
    return messagesTokens + summaryTokens > maxTokens;
  }

  private async summarize(state: LLMLoopState): Promise<LLMLoopState> {
    const { keepTokens, model, summarySystemNote, maxTokens } = this.params;
    const groups = this.groupMessages(state.messages);
    if (!groups.length) return state;

    // Tail selection based on token budget (mirrors lgnode impl)
    const tail: LLMMessage[][] = [];
    if (keepTokens > 0) {
      const counts = await this.groupsTokenCounts(groups);
      let used = 0;
      for (let i = groups.length - 1; i >= 0; i--) {
        const g = groups[i];
        const cost = counts[i];
        if (used + cost > keepTokens && tail.length) break;
        if (used + cost > keepTokens && !tail.length) {
          tail.unshift(g);
          break;
        }
        used += cost;
        tail.unshift(g);
      }
    }
    const tailStartIndex = groups.length - tail.length;
    const olderGroups = groups.slice(0, tailStartIndex);
    if (!olderGroups.length) {
      return { ...state, messages: tail.flat() };
    }

    const olderMessages = olderGroups.flat();
    const systemPrompt =
      summarySystemNote ||
      'You update a running summary of a conversation. Keep key facts, goals, decisions, constraints, names, deadlines, and follow-ups. Be concise; use compact sentences; omit chit-chat.';

    const foldLines = stringify(olderMessages);

    const userPrompt = `Previous summary:\n${state.summary ?? '(none)'}\n\nFold in the following messages (grouped tool responses kept together):\n${foldLines}\n\nReturn only the updated summary.`;

    // Prepare tracing oldContext by mapping all current messages
    const tracingOldContext = state.messages.map((m) => toTracingChatMessage(m));

    const task = await withSummarize(
      {
        oldContext: tracingOldContext,
      },
      async () => {
        const response = await this.llm.responses.create({
          model,
          input: [LLMUtils.inputMessage('system', systemPrompt), LLMUtils.inputMessage('user', userPrompt)],
        });
        const assistantMsg = response.output.find((o) => o.type === 'message');
        let newSummary = state.summary || '';
        if (assistantMsg) {
          const pieces = assistantMsg.content
            .map((c: any) => (c.type === 'output_text' ? c.text : ''))
            .filter((t: string) => t.length > 0);
          if (pieces.length) newSummary = pieces.join('\n').trim();
        }
        const newContext = tail.flat().map((m) => toTracingChatMessage(m));
        return new SummarizeResponse({
          raw: { summary: newSummary, newContext: tail.flat() },
          summary: newSummary,
          newContext,
        });
      },
    );

    return { summary: task.summary, messages: tail.flat() };
  }

  async invoke(state: LLMLoopState, _ctx: LLMLoopContext): Promise<LLMLoopState> {
    if (!(this.params.maxTokens > 0)) return state; // disabled summarization

    let working: LLMLoopState = { ...state };
    const doSummarize = await this.shouldSummarize(working);
    if (doSummarize) {
      working = await this.summarize(working);
    }

    return working;
  }
}
