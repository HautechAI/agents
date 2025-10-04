import { describe, it, expect, vi } from 'vitest';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { CallModelNode } from '../../src/lgnodes/callModel.lgnode';

// Mock OpenAI LLM to detect invocation
vi.mock('@langchain/openai', () => {
  class MockChatOpenAI {
    withConfig() {
      return { invoke: vi.fn(async () => new AIMessage('ok')) };
    }
  }
  return { ChatOpenAI: MockChatOpenAI } as any;
});

describe('CallModelNode diag hook', () => {
  it('synthesizes memory_dump tool call and skips LLM', async () => {
    const invokeSpy = vi.fn();
    const fakeLLM: any = { withConfig: () => ({ invoke: invokeSpy }) };
    const node = new CallModelNode([], fakeLLM);
    node.setSystemPrompt('SYS');
    const state = { messages: [new HumanMessage(JSON.stringify({ content: 'diag memory_dump /' }))] };
    const res = await node.action(state as any, {} as any);
    expect(res.messages?.items.length).toBe(1);
    const ai = res.messages?.items[0] as AIMessage;
    const toolCalls = (ai as any).tool_calls || [];
    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0].name).toBe('memory_dump');
    expect(toolCalls[0].args).toEqual({ path: '/' });
    expect(invokeSpy).not.toHaveBeenCalled();
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
