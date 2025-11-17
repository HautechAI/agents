import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { RunTimelineEvent } from '@/api/types/agents';

vi.mock('@/config', () => ({
  getSocketBaseUrl: () => 'http://localhost:3010',
}));

const socketState = vi.hoisted(() => ({
  current: null as {
    handlers: Map<string, (payload: unknown) => void>;
    on: (event: string, handler: (payload: unknown) => void) => void;
    emit: (...args: unknown[]) => void;
    io: { on: (event: string, handler: () => void) => void };
  } | null,
}));

function createSocketMock() {
  const handlers = new Map<string, (payload: unknown) => void>();
  return {
    handlers,
    on: vi.fn((event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler);
    }),
    emit: vi.fn(),
    io: {
      on: vi.fn(),
    },
  };
}

vi.mock('socket.io-client', () => ({
  io: () => {
    if (!socketState.current) throw new Error('socket mock not configured');
    return socketState.current;
  },
}));

describe('GraphSocket run timeline events', () => {
  let socketMock: ReturnType<typeof createSocketMock>;
  let GraphSocketClass: new () => unknown;

  beforeEach(async () => {
    vi.resetModules();
    socketMock = createSocketMock();
    socketState.current = socketMock;
    const module = await import('../socket');
    GraphSocketClass = (module.graphSocket as { constructor: new () => unknown }).constructor;
  });

  afterEach(() => {
    socketState.current = null;
  });

  it('routes new and legacy run timeline events without duplication', () => {
    const instance = new GraphSocketClass() as unknown as {
      connect(): unknown;
      onRunEvent(cb: (payload: any) => void): () => void;
      getRunCursor(runId: string): { ts: string; id: string } | null;
    };
    instance.connect();

    const handleLegacy = socketMock.handlers.get('run_event_appended');
    const handleCreated = socketMock.handlers.get('run_timeline_event_created');
    const handleUpdated = socketMock.handlers.get('run_timeline_event_updated');
    expect(typeof handleLegacy).toBe('function');
    expect(typeof handleCreated).toBe('function');
    expect(typeof handleUpdated).toBe('function');

    const listener = vi.fn();
    const off = instance.onRunEvent(listener);

    const appendEvent: RunTimelineEvent = {
      id: 'evt-1',
      runId: 'run-1',
      threadId: 'thread-1',
      type: 'tool_execution',
      status: 'running',
      ts: '2024-01-01T00:00:00.000Z',
      startedAt: null,
      endedAt: null,
      durationMs: null,
      nodeId: null,
      sourceKind: 'runtime',
      sourceSpanId: null,
      metadata: {},
      errorCode: null,
      errorMessage: null,
      toolExecution: {
        toolName: 'search',
        toolCallId: 'call-1',
        execStatus: 'pending',
        input: { query: 'status' },
        output: null,
        errorMessage: null,
        raw: null,
      },
      attachments: [],
    };

    const legacyPayload = { runId: 'run-1', mutation: 'append' as const, event: appendEvent };
    handleLegacy!(legacyPayload);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(legacyPayload);
    expect(instance.getRunCursor('run-1')).toEqual({ ts: appendEvent.ts, id: appendEvent.id });

    handleCreated!(legacyPayload);
    handleLegacy!(legacyPayload);
    expect(listener).toHaveBeenCalledTimes(1);

    const updatedEvent: RunTimelineEvent = {
      ...appendEvent,
      status: 'success',
      ts: '2024-01-01T00:00:01.000Z',
      toolExecution: {
        ...appendEvent.toolExecution!,
        execStatus: 'success',
        output: { answer: 42 },
      },
    };

    const updatePayload = { runId: 'run-1', mutation: 'update' as const, event: updatedEvent };
    handleUpdated!(updatePayload);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(updatePayload);
    expect(instance.getRunCursor('run-1')).toEqual({ ts: updatedEvent.ts, id: updatedEvent.id });

    handleLegacy!(updatePayload);
    expect(listener).toHaveBeenCalledTimes(2);

    const secondUpdateEvent: RunTimelineEvent = {
      ...updatedEvent,
      status: 'error',
      ts: '2024-01-01T00:00:02.000Z',
      toolExecution: {
        ...updatedEvent.toolExecution!,
        execStatus: 'error',
        output: { answer: 99 },
        errorMessage: 'Tool still failing',
      },
    };
    const secondUpdatePayload = { runId: 'run-1', mutation: 'update' as const, event: secondUpdateEvent };

    handleUpdated!(secondUpdatePayload);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener).toHaveBeenLastCalledWith(secondUpdatePayload);
    expect(listener.mock.calls[2][0].event.toolExecution?.output).toEqual({ answer: 99 });
    expect(instance.getRunCursor('run-1')).toEqual({ ts: secondUpdateEvent.ts, id: secondUpdateEvent.id });

    handleLegacy!(secondUpdatePayload);
    expect(listener).toHaveBeenCalledTimes(3);

    handleUpdated!(secondUpdatePayload);
    expect(listener).toHaveBeenCalledTimes(3);

    off();
  });
});
