import React, { type ComponentType } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, within, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RunTimelineEvent, RunTimelineSummary, RunEventStatus, RunEventType, RunTimelineEventsCursor } from '@/api/types/agents';

vi.mock('@/config', () => ({
  getSocketBaseUrl: () => 'http://localhost:3010',
}));

const runsModule = vi.hoisted(() => ({
  timelineEvents: vi.fn(),
}));

vi.mock('@/api/modules/runs', () => ({
  runs: {
    timelineEvents: runsModule.timelineEvents,
  },
}));

const queryMocks = vi.hoisted(() => ({
  summaryMock: vi.fn<(runId: string | undefined) => MockedSummaryResult>(),
  eventsMock: vi.fn<(runId: string | undefined, filters: { types: string[]; statuses: string[] }) => MockedEventsResult>(),
  summaryRefetch: vi.fn(),
  eventsRefetch: vi.fn(),
}));

vi.mock('@/api/hooks/runs', () => ({
  useRunTimelineSummary: (runId: string | undefined) => queryMocks.summaryMock(runId),
  useRunTimelineEvents: (runId: string | undefined, filters: { types: string[]; statuses: string[] }) =>
    queryMocks.eventsMock(runId, filters),
}));

type SocketMock = ReturnType<typeof createSocketMock>;

const socketState = vi.hoisted(() => ({
  instance: null as SocketMock | null,
  subscriptions: [] as Array<{ rooms?: string[]; room?: string }>,
}));

function createSocketMock() {
  const handlers = new Map<string, (payload: any) => void>();
  return {
    handlers,
    on: vi.fn((event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler as (payload: any) => void);
    }),
    emit: vi.fn((event: string, payload: unknown) => {
      if (event === 'subscribe' && payload && typeof payload === 'object') {
        socketState.subscriptions.push(payload as { rooms?: string[]; room?: string });
      }
    }),
    io: {
      on: vi.fn(),
    },
    connected: true,
  };
}

vi.mock('socket.io-client', () => ({
  io: () => {
    if (!socketState.instance) throw new Error('socket mock not configured');
    return socketState.instance;
  },
}));

type MockedSummaryResult = {
  data: RunTimelineSummary;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};

type MockedEventsResult = {
  data: { items: RunTimelineEvent[]; nextCursor: RunTimelineEventsCursor | null };
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};

function buildEvent(overrides: Partial<RunTimelineEvent> = {}): RunTimelineEvent {
  return {
    id: 'event-1',
    runId: 'run-1',
    threadId: 'thread-1',
    type: 'tool_execution',
    status: 'success',
    ts: '2024-01-01T00:00:00.000Z',
    startedAt: '2024-01-01T00:00:00.000Z',
    endedAt: '2024-01-01T00:00:01.500Z',
    durationMs: 1500,
    nodeId: 'node-1',
    sourceKind: 'internal',
    sourceSpanId: 'span-1',
    metadata: {},
    errorCode: null,
    errorMessage: null,
    llmCall: undefined,
    toolExecution: {
      toolName: 'Search Tool',
      toolCallId: 'call-1',
      execStatus: 'success',
      input: {},
      output: {},
      errorMessage: null,
      raw: null,
    },
    summarization: undefined,
    injection: undefined,
    message: undefined,
    attachments: [],
    ...overrides,
  } satisfies RunTimelineEvent;
}

function buildSummary(events: RunTimelineEvent[]): RunTimelineSummary {
  const countsByType = events.reduce<Record<RunEventType, number>>((acc, ev) => {
    acc[ev.type] = (acc[ev.type] ?? 0) + 1;
    return acc;
  }, {
    invocation_message: 0,
    injection: 0,
    llm_call: 0,
    tool_execution: 0,
    summarization: 0,
  });
  const countsByStatus = events.reduce<Record<RunEventStatus, number>>((acc, ev) => {
    acc[ev.status] = (acc[ev.status] ?? 0) + 1;
    return acc;
  }, {
    pending: 0,
    running: 0,
    success: 0,
    error: 0,
    cancelled: 0,
  });
  return {
    runId: 'run-1',
    threadId: 'thread-1',
    status: 'running',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: events[events.length - 1]?.ts ?? '2024-01-01T00:00:00.000Z',
    firstEventAt: events[0]?.ts ?? null,
    lastEventAt: events[events.length - 1]?.ts ?? null,
    countsByType,
    countsByStatus,
    totalEvents: events.length,
  };
}

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('AgentsRunTimeline realtime integration', () => {
  let AgentsRunTimelineComponent: ComponentType;
  let graphSocket: { getRunCursor(runId: string): RunTimelineEventsCursor | null };

  function renderPage(initialEntries: string[]) {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: Number.POSITIVE_INFINITY,
          staleTime: Number.POSITIVE_INFINITY,
        },
      },
    });

    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/agents/threads/:threadId/runs/:runId" element={<AgentsRunTimelineComponent />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  const emitTimeline = async (event: 'run_event_appended' | 'run_timeline_event_created' | 'run_timeline_event_updated', payload: unknown) => {
    const handler = socketState.instance?.handlers.get(event);
    if (!handler) throw new Error(`No handler registered for ${event}`);
    await act(async () => {
      handler(payload);
      await Promise.resolve();
    });
  };

  beforeEach(async () => {
    vi.resetModules();
    runsModule.timelineEvents.mockReset();
    queryMocks.summaryMock.mockReset();
    queryMocks.eventsMock.mockReset();
    queryMocks.summaryRefetch.mockReset();
    queryMocks.eventsRefetch.mockReset();
    socketState.subscriptions = [];
    socketState.instance = createSocketMock();
    setMatchMedia(true);

    const [{ AgentsRunTimeline }, socketModule] = await Promise.all([
      import('../AgentsRunTimeline'),
      import('@/lib/graph/socket'),
    ]);
    AgentsRunTimelineComponent = AgentsRunTimeline;
    graphSocket = socketModule.graphSocket;

    const events = [
      buildEvent(),
      buildEvent({
        id: 'event-2',
        ts: '2024-01-01T00:00:02.000Z',
        type: 'llm_call',
        toolExecution: undefined,
        llmCall: {
          provider: 'openai',
          model: 'gpt-4',
          temperature: null,
          topP: null,
          stopReason: null,
          contextItemIds: [],
          responseText: null,
          rawResponse: null,
          toolCalls: [],
        },
      }),
    ];

    queryMocks.summaryMock.mockReturnValue({
      data: buildSummary(events),
      isLoading: false,
      isError: false,
      error: null,
      refetch: queryMocks.summaryRefetch,
    });

    queryMocks.eventsMock.mockReturnValue({
      data: { items: events, nextCursor: { ts: '2024-01-01T00:00:02.000Z', id: 'event-2' } },
      isFetching: false,
      isError: false,
      error: null,
      refetch: queryMocks.eventsRefetch,
    });
  });

  afterEach(() => {
    socketState.instance = null;
  });

  it('merges realtime run timeline events across rooms, dedupes duplicates, and bumps cursors', async () => {
    const { getByRole, unmount } = renderPage(['/agents/threads/thread-1/runs/run-1']);

    expect(socketState.subscriptions.map((item) => item.rooms)).toContainEqual(['run:run-1', 'thread:thread-1']);
    expect(graphSocket.getRunCursor('run-1')).toEqual({ ts: '2024-01-01T00:00:02.000Z', id: 'event-2' });

    const listbox = getByRole('listbox');
    expect(within(listbox).getAllByRole('option')).toHaveLength(2);

    const createdEvent = buildEvent({
      id: 'event-3',
      ts: '2024-01-01T00:00:03.000Z',
      type: 'summarization',
      status: 'running',
      toolExecution: undefined,
      summarization: {
        summaryText: 'initial summary',
        newContextCount: 1,
        oldContextTokens: null,
        raw: null,
      },
    });

    await emitTimeline('run_timeline_event_created', { runId: 'run-1', mutation: 'append', event: createdEvent });

    await waitFor(() => expect(within(listbox).getAllByRole('option')).toHaveLength(3));
    const createdOption = within(listbox).getByText('Summarization').closest('[role="option"]');
    expect(createdOption).not.toBeNull();
    if (!createdOption) throw new Error('Summarization option missing');
    expect(within(createdOption).getByText('running')).toBeInTheDocument();
    expect(queryMocks.summaryRefetch).toHaveBeenCalledTimes(1);
    expect(graphSocket.getRunCursor('run-1')).toEqual({ ts: createdEvent.ts, id: createdEvent.id });

    const firstUpdate = {
      ...createdEvent,
      ts: '2024-01-01T00:00:03.500Z',
      status: 'error' as RunEventStatus,
      summarization: {
        ...createdEvent.summarization!,
        summaryText: 'errored summary',
      },
    } satisfies RunTimelineEvent;

    await emitTimeline('run_timeline_event_updated', { runId: 'run-1', mutation: 'update', event: firstUpdate });

    await waitFor(() => expect(within(createdOption).getByText('error')).toBeInTheDocument());
    expect(queryMocks.summaryRefetch).toHaveBeenCalledTimes(2);
    expect(graphSocket.getRunCursor('run-1')).toEqual({ ts: firstUpdate.ts, id: firstUpdate.id });

    await emitTimeline('run_timeline_event_updated', { runId: 'run-1', mutation: 'update', event: firstUpdate });
    expect(queryMocks.summaryRefetch).toHaveBeenCalledTimes(2);
    expect(graphSocket.getRunCursor('run-1')).toEqual({ ts: firstUpdate.ts, id: firstUpdate.id });

    const secondUpdate = {
      ...firstUpdate,
      ts: '2024-01-01T00:00:04.000Z',
      status: 'success' as RunEventStatus,
      summarization: {
        ...firstUpdate.summarization!,
        summaryText: 'final summary',
      },
    } satisfies RunTimelineEvent;

    await emitTimeline('run_timeline_event_updated', { runId: 'run-1', mutation: 'update', event: secondUpdate });

    await waitFor(() => expect(within(createdOption).getByText('success')).toBeInTheDocument());
    expect(queryMocks.summaryRefetch).toHaveBeenCalledTimes(3);
    expect(graphSocket.getRunCursor('run-1')).toEqual({ ts: secondUpdate.ts, id: secondUpdate.id });

    const options = within(listbox).getAllByRole('option');
    expect(options[options.length - 1]).toBe(createdOption);

    unmount();
    expect(graphSocket.getRunCursor('run-1')).toBeNull();
  });
});
