import { AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { withSummarize, SummarizeResponse, BaseMessage as ObsBaseMessage } from '@hautech/obs-sdk';
import { NodeOutput } from '../types';

export type ChatState = { messages: BaseMessage[]; summary?: string };
export type SummarizationOptions = { llm: ChatOpenAI; keepTokens: number; maxTokens: number; summarySystemNote?: string };

export class SummarizationNode {
  private keepTokens?: number;
  private maxTokens?: number;
  private summarySystemNote?: string;
  constructor(private llm: ChatOpenAI, opts: { keepTokens: number; maxTokens: number; summarySystemNote?: string }) {
    this.keepTokens = opts.keepTokens;
    this.maxTokens = opts.maxTokens;
    this.summarySystemNote = opts.summarySystemNote;
  }
  setOptions(opts: Partial<{ keepTokens: number; maxTokens: number; summarySystemNote: string }>): void {
    if (opts.keepTokens !== undefined) this.keepTokens = opts.keepTokens;
    if (opts.maxTokens !== undefined) this.maxTokens = opts.maxTokens;
    if (opts.summarySystemNote !== undefined) this.summarySystemNote = opts.summarySystemNote;
  }
  async countTokens(llm: ChatOpenAI, messagesOrText: BaseMessage[] | string): Promise<number> {
    if (typeof messagesOrText === 'string') { try { return await llm.getNumTokens(messagesOrText); } catch { return messagesOrText.length; } }
    let total = 0;
    for (const m of messagesOrText) {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      try { total += await llm.getNumTokens(content); } catch { total += content.length; }
    }
    return total;
  }
  groupMessages(messages: BaseMessage[]): BaseMessage[][] {
    const groups: BaseMessage[][] = []; let i = 0;
    while (i < messages.length) {
      const m = messages[i];
      if (m instanceof AIMessage && (m.tool_calls?.length || 0) > 0) {
        const group: BaseMessage[] = [m]; i++;
        while (i < messages.length) { const next = messages[i]; if (next instanceof ToolMessage && (next as any).tool_call_id) { group.push(next); i++; continue; } break; }
        groups.push(group);
      } else if (m instanceof ToolMessage) { i++; continue; }
      else { groups.push([m]); i++; }
    }
    return groups;
  }
  async groupsTokenCounts(llm: ChatOpenAI, groups: BaseMessage[][]): Promise<number[]> { return Promise.all(groups.map((g) => this.countTokens(llm, g))); }
  async shouldSummarize(state: ChatState, opts: SummarizationOptions): Promise<boolean> {
    const groups = this.groupMessages(state.messages); if (groups.length <= 1) return false;
    const messagesTokens = await this.countTokens(opts.llm, state.messages);
    const summaryTokens = state.summary ? await this.countTokens(opts.llm, state.summary) : 0;
    return messagesTokens + summaryTokens > opts.maxTokens;
  }
  async summarize(state: ChatState, opts: SummarizationOptions): Promise<ChatState> {
    const groups = this.groupMessages(state.messages); if (!groups.length) return state;
    const keepTokens = this.keepTokens ?? 0; const llm = this.llm;
    const tail: BaseMessage[][] = [];
    if (keepTokens > 0) {
      const counts = await this.groupsTokenCounts(llm, groups); let used = 0;
      for (let i = groups.length - 1; i >= 0; i--) { const cost = counts[i]; if (used + cost > keepTokens && tail.length) break; if (used + cost > keepTokens && !tail.length) { tail.unshift(groups[i]); break; } used += cost; tail.unshift(groups[i]); }
    }
    const tailStartIndex = groups.length - tail.length; const olderGroups = groups.slice(0, tailStartIndex);
    if (!olderGroups.length) return { messages: tail.flat(), summary: state.summary };

    const olderMessages = olderGroups.flat();
    const sys = new SystemMessage('You update a running summary of a conversation. Keep key facts, goals, decisions, constraints, names, deadlines, and follow-ups. Be concise; use compact sentences; omit chit-chat.');
    const foldLines = olderMessages.map((m) => `${m._getType().toUpperCase()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n');
    const human = new HumanMessage(`Previous summary:\n${state.summary ?? '(none)'}\n\nFold in the following messages (grouped tool responses kept together):\n${foldLines}\n\nReturn only the updated summary.`);

    const task = await withSummarize({ oldContext: state.messages.map((m) => ObsBaseMessage.fromLangChain(m)) }, async () => {
      const invocation = (await this.llm.invoke([sys, human])) as AIMessage;
      const summary = typeof invocation.content === 'string' ? invocation.content : JSON.stringify(invocation.content);
      const newContext = tail.flat();
      return new SummarizeResponse({ raw: { summary, newContext }, summary, newContext: newContext.map((m) => ObsBaseMessage.fromLangChain(m)) });
    });
    return { summary: task.summary, messages: task.newContext };
  }
  async action(state: ChatState): Promise<NodeOutput> {
    const keepTokens = this.keepTokens ?? 0; const maxTokens = this.maxTokens ?? 0; if (!(keepTokens >= 0) || !(maxTokens > 0)) return { summary: state.summary ?? '' };
    const opts: SummarizationOptions = { llm: this.llm, keepTokens, maxTokens, summarySystemNote: this.summarySystemNote };
    let working: ChatState = { messages: state.messages, summary: state.summary };
    if (await this.shouldSummarize(working, opts)) working = await this.summarize(working, opts);
    const toolCallIds = new Set(working.messages.filter((m) => m instanceof ToolMessage).map((m) => m.tool_call_id));
    const omitAiWithoutToolCalls = working.messages.filter((m) => { if (!(m instanceof AIMessage)) return true; if (!m.tool_calls || m.tool_calls.length === 0) return true; const keep = m.tool_calls.every((tc) => toolCallIds.has(tc.id ?? '')); if (!keep) { try { console.error(`Omitting AI message without matching ToolMessages: ${m.id}`); } catch {} } return keep; });
    return { summary: working.summary ?? '', messages: { method: 'replace', items: omitAiWithoutToolCalls } };
  }
}

// Helper functional API for tests
export async function countTokens(llm: ChatOpenAI, messagesOrText: BaseMessage[] | string): Promise<number> { const helper = new SummarizationNode(llm, { keepTokens: 0, maxTokens: 1 }); return helper.countTokens(llm, messagesOrText); }
export async function shouldSummarize(state: ChatState, opts: SummarizationOptions): Promise<boolean> { const node = new SummarizationNode(opts.llm, { keepTokens: opts.keepTokens ?? 0, maxTokens: opts.maxTokens, summarySystemNote: opts.summarySystemNote }); return node.shouldSummarize(state, opts); }
export async function summarizationNode(state: ChatState, opts: SummarizationOptions): Promise<{ summary: string; messages: BaseMessage[] }> { const node = new SummarizationNode(opts.llm, { keepTokens: opts.keepTokens ?? 0, maxTokens: opts.maxTokens, summarySystemNote: opts.summarySystemNote }); const res = await node.action(state); return { summary: res.summary as string, messages: (res.messages as any)?.items || state.messages }; }
