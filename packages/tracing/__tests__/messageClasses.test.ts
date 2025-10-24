import { describe, it, expect } from 'vitest';
import { Message, SystemMessage, HumanMessage, AIMessage, ToolCallOutputMessage, withLLM, init, LLMResponse } from '../src/index';

// mock fetch
// @ts-ignore
global.fetch = async () => ({ ok: true });

init({ mode: 'extended', endpoints: { extended: '', otlp: '' } });

describe('Message class hierarchy', () => {
  it('creates concrete message instances', () => {
    const sys = SystemMessage.fromText('sys');
    const hum = HumanMessage.fromText('hi');
    const ai = new AIMessage({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hello' }] } as any);
    const tool = new ToolCallOutputMessage({ type: 'function_call_output', call_id: '1', output: 'result' } as any);
    expect(sys.role).toBe('system');
    expect(hum.role).toBe('user');
    expect(ai.role).toBe('assistant');
    expect(tool.callId).toBe('1');
  });

  it('fromPlain maps user/assistant/tool formats', () => {
    const lcUser = { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello there' }] } as any;
    const lcAi = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hi' }] } as any;
    const lcTool = { type: 'function_call_output', call_id: 'abc', output: 'done' } as any;
    const m1 = Message.fromPlain(lcUser);
    const m2 = Message.fromPlain(lcAi);
    const m3 = Message.fromPlain(lcTool);
    expect(m1 instanceof HumanMessage).toBe(true);
    expect(m2 instanceof AIMessage).toBe(true);
    expect(m3 instanceof ToolCallOutputMessage).toBe(true);
  });
});

describe('withLLM context normalization', () => {
  it('accepts raw objects and converts them', async () => {
    const rawContext = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hello' },
    ];
    const res = await withLLM({ context: rawContext as any }, async () => new LLMResponse({ raw: { content: 'ok' }, content: 'ok' }));
    expect(res).toEqual({ content: 'ok' });
  });
});
