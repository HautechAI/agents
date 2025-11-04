import { describe, it, expect, vi } from 'vitest';
// Mock Prisma client early to avoid generated client requirement
vi.mock('@prisma/client', () => ({
  MessageKind: { user: 'user', system: 'system', assistant: 'assistant', tool: 'tool' },
  RunStatus: { finished: 'finished', running: 'running', terminated: 'terminated' },
  RunMessageType: { input: 'input', output: 'output', injected: 'injected' },
  Prisma: { JsonNull: null },
}));
const { AgentsPersistenceService } = await import('../src/agents/agents.persistence.service');
import { AIMessage, HumanMessage, SystemMessage, ToolCallMessage, ToolCallOutputMessage } from '@agyn/llm';
import type { ResponseFunctionToolCall } from 'openai/resources/responses/responses.mjs';

function makeService(): InstanceType<typeof AgentsPersistenceService> {
  // Minimal stub; extractKindText does not use prisma
  return new AgentsPersistenceService({ getClient: () => ({}) } as any);
}

describe('AgentsPersistenceService.extractKindText', () => {
  it('derives text for user/system input_text', () => {
    const svc = makeService() as any;
    const hm = HumanMessage.fromText('hello').toPlain();
    const sm = SystemMessage.fromText('sys prompt').toPlain();

    const a = svc["extractKindText"](hm);
    expect(a).toEqual({ kind: 'user', text: 'hello' });

    const b = svc["extractKindText"](sm);
    expect(b).toEqual({ kind: 'system', text: 'sys prompt' });
  });

  it('derives text for assistant output_text', () => {
    const svc = makeService() as any;
    const am = AIMessage.fromText('hi there').toPlain();
    const out = svc["extractKindText"](am);
    expect(out).toEqual({ kind: 'assistant', text: 'hi there' });
  });

  it('handles function_call and function_call_output', () => {
    const svc = makeService() as any;
    const call = new ToolCallMessage({ type: 'function_call', call_id: '1', name: 'tool', arguments: '{"a":1}' } as ResponseFunctionToolCall).toPlain();
    const outStr = ToolCallOutputMessage.fromResponse('1', 'ok').toPlain();
    const outJson = ToolCallOutputMessage.fromResponse('1', { foo: 'bar' } as any).toPlain();

    const a = svc["extractKindText"](call);
    expect(a.kind).toBe('tool');
    expect(a.text).toBe('call tool({"a":1})');

    const b = svc["extractKindText"](outStr);
    expect(b).toEqual({ kind: 'tool', text: 'ok' });

    const c = svc["extractKindText"](outJson);
    expect(c?.kind).toBe('tool');
    expect(c?.text).toBe(JSON.stringify({ foo: 'bar' }));
  });

  it('falls back to top-level text and then content[].text', () => {
    const svc = makeService() as any;
    const msgWithText = { type: 'message', role: 'user', text: 'T', content: [{ type: 'input_text', text: 'X' }] };
    const msgWithOnlyContent = { type: 'message', role: 'user', content: [{ type: 'unknown', text: 'A' }, { type: 'input_text', text: 'B' }] } as any;

    const a = svc["extractKindText"](msgWithText);
    expect(a).toEqual({ kind: 'user', text: 'T' });

    const b = svc["extractKindText"](msgWithOnlyContent);
    // For user role, use only input_text content
    expect(b).toEqual({ kind: 'user', text: 'B' });
  });
});

describe('AgentsPersistenceService beginRun/completeRun populates Message.text', () => {
  it('populates text for inputs and outputs', async () => {
    const createdMessages: any[] = [];
    const createdRunMessages: any[] = [];
    const runs: any[] = [];
    const prismaMock = {
      thread: {
        findUnique: async (_q: any) => ({ id: 'thread-1' }),
        create: async (_d: any) => ({ id: 'thread-1' }),
      },
      run: {
        create: async ({ data }: any) => {
          const r = { id: 'run-1', ...data };
          runs.push(r);
          return r;
        },
        update: async ({ where, data }: any) => {
          const r = runs.find((x) => x.id === where.id);
          if (r) Object.assign(r, data);
          return r;
        },
      },
      message: {
        create: async ({ data }: any) => {
          const m = { id: `m${createdMessages.length + 1}` , ...data };
          createdMessages.push(m);
          return m;
        },
        findMany: async () => createdMessages,
      },
      runMessage: {
        create: async ({ data }: any) => {
          createdRunMessages.push(data);
          return data;
        },
      },
      $transaction: async (cb: any) => cb(prismaMock),
    } as any;

    const svc = new AgentsPersistenceService({ getClient: () => prismaMock } as any);

    // Begin run with user + system messages
    const input = [HumanMessage.fromText('hello').toPlain(), SystemMessage.fromText('sys').toPlain()] as any;
    const started = await svc.beginRun('alias-x', input);
    expect(started.runId).toBe('run-1');
    const inputs = createdMessages.filter((m) => createdRunMessages.find((r) => r.messageId === m.id && r.type === 'input'));
    expect(inputs.map((m) => m.text)).toEqual(['hello', 'sys']);

    // Complete run with assistant output and tool events
    const call = new ToolCallMessage({ type: 'function_call', call_id: 'c1', name: 'echo', arguments: '{"x":1}' } as ResponseFunctionToolCall).toPlain();
    const out = AIMessage.fromText('done').toPlain();
    const toolOut = ToolCallOutputMessage.fromResponse('c1', 'ok').toPlain();
    await svc.completeRun(started.runId, 'finished' as any, [out, call, toolOut] as any);

    const outputs = createdMessages.filter((m) => createdRunMessages.find((r) => r.messageId === m.id && r.type === 'output'));
    expect(outputs.map((m) => m.text)).toEqual(['done', 'call echo({"x":1})', 'ok']);
  });
});

