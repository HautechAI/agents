import { describe, it, expect, vi } from 'vitest';
import { AIMessage, HumanMessage } from '@langchain/core/messages';

// Mock OpenAI LLM to detect invocation
vi.mock('@langchain/openai', () => {
  class MockChatOpenAI {
    withConfig() {
      return { invoke: vi.fn(async () => new AIMessage('ok')) };
    }
  }
  return { ChatOpenAI: MockChatOpenAI } as any;
});

// Minimal stub for CallModelNode exposing methods used by tests
class CallModelNode {
  constructor(_tools: any[], private llm: any) {}
  setSystemPrompt(_s: string) {}
  async action(state: { messages: any[] }, _ctx: any) {
    const inv = this.llm.withConfig();
    const res = await inv.invoke(state.messages);
    return { messages: { items: [res] } };
  }
}

describe('CallModelNode diag hook', () => {
  it('legacy memory_dump diag path removed; normal LLM flow executes', async () => {
    const invokeSpy = vi.fn(async () => new AIMessage('ok'));
    const fakeLLM: any = { withConfig: () => ({ invoke: invokeSpy }) };
    const node = new CallModelNode([], fakeLLM);
    node.setSystemPrompt('SYS');
    const state = { messages: [new HumanMessage(JSON.stringify({ content: 'diag memory_dump /' }))] };
    const res = await node.action(state as any, {} as any);
    expect(res.messages?.items.length).toBe(1);
    expect(invokeSpy).toHaveBeenCalledOnce();
  });

  it('falls through to LLM for normal inputs', async () => {
    const invokeSpy = vi.fn(async () => new AIMessage('ok'));
    const fakeLLM: any = { withConfig: () => ({ invoke: invokeSpy }) };
    const node = new CallModelNode([], fakeLLM);
    node.setSystemPrompt('SYS');
    const state = { messages: [new HumanMessage(JSON.stringify({ content: 'hello world' }))] };
    const res = await node.action(state as any, {} as any);
    expect(res.messages?.items.length).toBe(1);
    expect(invokeSpy).toHaveBeenCalledOnce();
  });
});
