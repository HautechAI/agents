import { describe, it, expect, vi } from 'vitest';
import { ResponseMessage, ToolCallMessage } from '@agyn/llm';
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';
import { LoggerService } from '../src/core/services/logger.service.js';
import { createRunEventsStub } from './helpers/runEvents.stub';

vi.mock('@agyn/tracing', () => {
  class ToolCallResponse<TRaw = unknown, TOutput = unknown> {
    raw: TRaw;
    output?: TOutput;
    status: 'success' | 'error';

    constructor(params: { raw: TRaw; output?: TOutput; status: 'success' | 'error' }) {
      this.raw = params.raw;
      this.output = params.output;
      this.status = params.status;
    }
  }

  const withToolCall = async (
    _attrs: unknown,
    fn: () => Promise<ToolCallResponse> | ToolCallResponse,
  ): Promise<unknown> => {
    const res = await fn();
    return res instanceof ToolCallResponse ? res.raw : res;
  };

  const loggerImpl = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  };

  const logger = () => loggerImpl;

  return { withToolCall, ToolCallResponse, logger } as const;
});

type MockFn = ReturnType<typeof vi.fn>;

describe('CallToolsLLMReducer context items', () => {
  it('persists request context items before results and maintains ordering', async () => {
    const runEvents = createRunEventsStub();
    const createContextItemsMock = runEvents.createContextItems as unknown as MockFn;
    const executionSnapshots: Array<{ name: string; callCount: number; input: unknown }> = [];

    const buildTool = (name: string) => ({
      name,
      description: `${name} tool`,
      schema: { safeParse: (value: unknown) => ({ success: true, data: value }) },
      execute: vi.fn(async (input: unknown) => {
        executionSnapshots.push({ name, callCount: createContextItemsMock.mock.calls.length, input });
        await Promise.resolve();
        return `${name}-result`;
      }),
    });

    const tools = [buildTool('alpha'), buildTool('beta')];
    const reducer = new CallToolsLLMReducer(new LoggerService(), runEvents as any).init({ tools });

    const toolCalls = [
      new ToolCallMessage({ type: 'function_call', call_id: 'call-alpha', name: 'alpha', arguments: JSON.stringify({ foo: 1 }) } as any),
      new ToolCallMessage({ type: 'function_call', call_id: 'call-beta', name: 'beta', arguments: JSON.stringify({ bar: 2 }) } as any),
    ];

    const response = new ResponseMessage({ output: toolCalls.map((call) => call.toPlain() as any) as any });
    const initialState = { messages: [response], meta: {}, context: { messageIds: ['existing-1'], memory: [] } } as any;
    const ctx = { threadId: 'thread-1', runId: 'run-1', callerAgent: { getAgentNodeId: () => 'agent-node' } } as any;

    const result = await reducer.invoke(initialState, ctx);

    expect(createContextItemsMock).toHaveBeenCalledTimes(2);
    const [requestItems, resultItems] = createContextItemsMock.mock.calls.map(([items]) => items as any[]);

    expect(requestItems).toHaveLength(2);
    expect(requestItems[0].contentText).toBe('Request: alpha (id=call-alpha)');
    expect(requestItems[1].contentText).toBe('Request: beta (id=call-beta)');
    expect(requestItems[0].metadata?.phase).toBe('request');
    expect(requestItems[0].metadata?.callId).toBe('call-alpha');
    expect(requestItems[0].contentJson).toEqual({ foo: 1 });
    expect(requestItems[1].contentJson).toEqual({ bar: 2 });

    expect(executionSnapshots).toHaveLength(2);
    executionSnapshots.forEach((snapshot) => {
      expect(snapshot.callCount).toBe(1);
    });
    expect(executionSnapshots.find((s) => s.name === 'alpha')?.input).toEqual({ foo: 1 });
    expect(executionSnapshots.find((s) => s.name === 'beta')?.input).toEqual({ bar: 2 });

    expect(resultItems).toHaveLength(2);
    const requestIds = await (createContextItemsMock.mock.results[0]?.value as Promise<string[]>);
    const resultIds = await (createContextItemsMock.mock.results[1]?.value as Promise<string[]>);
    expect(result.context.messageIds).toEqual(['existing-1', ...requestIds, ...resultIds]);

    const appendedMessages = result.messages.slice(-2);
    expect(appendedMessages[0].text).toBe('alpha-result');
    expect(appendedMessages[1].text).toBe('beta-result');
  });

  it('records request context items even when tool execution fails', async () => {
    const runEvents = createRunEventsStub();
    const createContextItemsMock = runEvents.createContextItems as unknown as MockFn;

    const failingTool = {
      name: 'failing',
      description: 'fails',
      schema: { safeParse: (value: unknown) => ({ success: true, data: value }) },
      execute: vi.fn(async () => {
        expect(createContextItemsMock).toHaveBeenCalledTimes(1);
        throw new Error('boom');
      }),
    };

    const reducer = new CallToolsLLMReducer(new LoggerService(), runEvents as any).init({ tools: [failingTool] });
    const call = new ToolCallMessage({ type: 'function_call', call_id: 'call-fail', name: 'failing', arguments: JSON.stringify({ ok: true }) } as any);
    const response = new ResponseMessage({ output: [call.toPlain() as any] as any });
    const state = { messages: [response], meta: {}, context: { messageIds: ['existing-ctx'], memory: [] } } as any;
    const ctx = { threadId: 'thread', runId: 'run', callerAgent: { getAgentNodeId: () => 'node' } } as any;

    const result = await reducer.invoke(state, ctx);

    expect(createContextItemsMock).toHaveBeenCalledTimes(2);
    const [requestItems, resultItems] = createContextItemsMock.mock.calls.map(([items]) => items as any[]);

    expect(requestItems).toHaveLength(1);
    expect(requestItems[0].contentText).toBe('Request: failing (id=call-fail)');
    expect(requestItems[0].metadata?.phase).toBe('request');

    expect(resultItems).toHaveLength(1);
    const requestIds = await (createContextItemsMock.mock.results[0]?.value as Promise<string[]>);
    const resultIds = await (createContextItemsMock.mock.results[1]?.value as Promise<string[]>);
    expect(result.context.messageIds).toEqual(['existing-ctx', ...requestIds, ...resultIds]);
    expect(result.messages.at(-1)?.text).toContain('Tool failing execution failed');
  });
});
