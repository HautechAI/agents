import { describe, it, expect } from 'vitest';
import { SystemMessage, HumanMessage } from '@agyn/llm';
import { CallModelLLMReducer } from '../src/llm/reducers/callModel.llm.reducer';

class FakeLLM {
  lastInput: Array<SystemMessage | HumanMessage | { toJSON?: () => unknown; toPlain?: () => unknown }> = [];
  async call(opts: { model: string; input: Array<SystemMessage | HumanMessage | { toJSON?: () => unknown }> }) {
    this.lastInput = opts.input as any[];
    return { text: 'ok', output: [] } as any;
  }
}

describe('CallModelLLMReducer: summary injection', () => {
  it('inserts summary after system when present', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer({} as any);
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [] });
    await reducer.invoke({ messages: [HumanMessage.fromText('H1')], summary: 'SUM' } as any, { threadId: 't' } as any);
    expect(llm.lastInput[0] instanceof SystemMessage).toBe(true);
    expect((llm.lastInput[1] as HumanMessage).text).toBe('SUM');
  });

  it('respects memory placement with after_system (System, Human(sum), System(mem), ...)', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer({} as any);
    reducer.init({
      llm: llm as any,
      model: 'x',
      systemPrompt: 'SYS',
      tools: [],
      memoryProvider: async () => ({ msg: SystemMessage.fromText('MEM'), place: 'after_system' }),
    });
    await reducer.invoke({ messages: [HumanMessage.fromText('H1')], summary: 'SUM' } as any, { threadId: 't' } as any);
    expect(llm.lastInput[0] instanceof SystemMessage).toBe(true);
    expect((llm.lastInput[1] as HumanMessage).text).toBe('SUM');
    expect((llm.lastInput[2] as SystemMessage).text).toBe('MEM');
    expect((llm.lastInput[3] as HumanMessage).text).toBe('H1');
  });

  it('respects memory placement with last_message (System, Human(sum), ..., System(mem))', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer({} as any);
    reducer.init({
      llm: llm as any,
      model: 'x',
      systemPrompt: 'SYS',
      tools: [],
      memoryProvider: async () => ({ msg: SystemMessage.fromText('MEM'), place: 'last_message' }),
    });
    await reducer.invoke({ messages: [HumanMessage.fromText('H1')], summary: 'SUM' } as any, { threadId: 't' } as any);
    expect(llm.lastInput[0] instanceof SystemMessage).toBe(true);
    expect((llm.lastInput[1] as HumanMessage).text).toBe('SUM');
    expect((llm.lastInput[2] as HumanMessage).text).toBe('H1');
    expect((llm.lastInput[3] as SystemMessage).text).toBe('MEM');
  });

  it('does not inject when summary is empty/undefined', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer({} as any);
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [] });
    await reducer.invoke({ messages: [HumanMessage.fromText('H1')], summary: '' } as any, { threadId: 't' } as any);
    expect(llm.lastInput[1] instanceof HumanMessage).toBe(true);
    expect((llm.lastInput[1] as HumanMessage).text).toBe('H1');
  });

  it('prevents duplicate summary injection when same text exists', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer({} as any);
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [] });
    const summary = 'SUM';
    await reducer.invoke({ messages: [HumanMessage.fromText(summary)], summary } as any, { threadId: 't' } as any);
    // Should be [System, existing HumanMessage, ...]; no extra summary injected
    expect(llm.lastInput[0] instanceof SystemMessage).toBe(true);
    expect((llm.lastInput[1] as HumanMessage).text).toBe('SUM');
    expect(llm.lastInput.filter((m) => m instanceof HumanMessage).length).toBe(1);
  });

  it('applies token cap to injected summary without mutating state.summary', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer({} as any);
    // summaryMaxTokens=2 -> maxChars=8
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [], summaryMaxTokens: 2 });
    const long = 'abcdefghijklmno';
    const out = await reducer.invoke({ messages: [], summary: long } as any, { threadId: 't' } as any);
    expect((llm.lastInput[1] as HumanMessage).text).toBe('abcdefgh');
    // persisted state.summary should remain full string
    expect(out.summary).toBe(long);
  });

  it('respects disabled injectSummary flag', async () => {
    const llm = new FakeLLM();
    const reducer = new CallModelLLMReducer({} as any);
    reducer.init({ llm: llm as any, model: 'x', systemPrompt: 'SYS', tools: [], injectSummary: false });
    await reducer.invoke({ messages: [HumanMessage.fromText('H1')], summary: 'SUM' } as any, { threadId: 't' } as any);
    // Should not inject summary; first human remains H1
    expect(llm.lastInput[0] instanceof SystemMessage).toBe(true);
    expect((llm.lastInput[1] as HumanMessage).text).toBe('H1');
  });
});

