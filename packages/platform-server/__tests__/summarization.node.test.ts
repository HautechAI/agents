import { describe, it, expect, beforeEach } from 'vitest';
import { AIMessage, HumanMessage, ResponseMessage, ToolCallMessage } from '@agyn/llm';
import { SummarizationLLMReducer } from '../src/llm/reducers/summarization.llm.reducer';
import { LLMProvisioner } from '../src/llm/provisioners/llm.provisioner';
import type { LLMState } from '../src/llm/types';

let reducer: SummarizationLLMReducer;

beforeEach(async () => {
  const provisioner: Pick<LLMProvisioner, 'getLLM'> = {
    getLLM: async () => ({ call: async () => new ResponseMessage({ output: [AIMessage.fromText('SUMMARY').toPlain()] }) } as any),
  };
  reducer = new SummarizationLLMReducer(provisioner as LLMProvisioner);
  await reducer.init({ model: 'gpt-5', keepTokens: 10, maxTokens: 30, systemPrompt: 'summarize' });
});

describe('SummarizationLLMReducer', () => {
  it('does not summarize when within token budget', async () => {
    const state: LLMState = { messages: [HumanMessage.fromText('a'), HumanMessage.fromText('b')], summary: '' };
    // With keepTokens=10 and maxTokens=30, small inputs may be pruned without summarization
    const out = await reducer.invoke(state, { threadId: 't', finishSignal: { isActive: false } as any });
    expect(out.summary ?? '').toBe('');
  });

  it('summarizes when token count exceeds maxTokens', async () => {
    const msgs = Array.from({ length: 50 }).map((_, i) => HumanMessage.fromText(`m${i}`));
    const state: LLMState = { messages: msgs, summary: '' };
    const out = await reducer.invoke(state, { threadId: 't', finishSignal: { isActive: false } as any });
    expect((out.summary ?? '').length).toBeGreaterThan(0);
  });

  it('keeps tool call context and handles outputs during summarize', async () => {
    const call = new ToolCallMessage({ type: 'function_call', name: 't', call_id: 'c1', arguments: '{}' });
    const resp = new ResponseMessage({ output: [call.toPlain(), AIMessage.fromText('x').toPlain()] });
    const state: LLMState = { messages: [HumanMessage.fromText('h1'), resp], summary: '' };
    const out = await reducer.invoke(state, { threadId: 't', finishSignal: { isActive: false } as any });
    expect(out.messages.length).toBeGreaterThan(0);
  });
});
