import React from 'react';
import { http as _http, HttpResponse as _HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { AgentsRunTimeline } from '../../src/pages/AgentsRunTimeline';
import type { RunEventStatus, RunEventType, RunTimelineEvent, RunTimelineSummary } from '../../src/api/types/agents';
import { abs, server, TestProviders } from './testUtils';

type RequestLog = {
  limit: string | null;
  order: string | null;
  cursorTs: string | null;
  cursorId: string | null;
  types: string | null;
  statuses: string | null;
};

const THREAD_ID = 'thread-integration';
const RUN_ID = 'run-integration';
const BASE_TIME = Date.parse('2024-06-01T12:00:00.000Z');

function buildTimelineDataset(total: number): {
  events: RunTimelineEvent[];
  summary: RunTimelineSummary;
  byId: Map<string, RunTimelineEvent>;
  successCount: number;
} {
  const typeCycle: RunEventType[] = ['tool_execution', 'llm_call', 'invocation_message', 'summarization', 'injection'];
  const events: RunTimelineEvent[] = [];
  const byId = new Map<string, RunTimelineEvent>();
  let successCount = 0;

  for (let i = 0; i < total; i += 1) {
    const order = total - i;
    const tsMs = BASE_TIME + order * 60_000;
    const startedAt = new Date(tsMs).toISOString();
    const endedAt = new Date(tsMs + 45_000).toISOString();
    const type = typeCycle[i % typeCycle.length];

    let status: RunEventStatus = 'success';
    if (type === 'injection') {
      status = 'pending';
    } else if (type === 'invocation_message' && i % 5 === 0) {
      status = 'running';
    } else if (type === 'llm_call' && i % 4 === 0) {
      status = 'error';
    } else if (type === 'tool_execution' && i % 11 === 0) {
      status = 'error';
    } else if (i % 37 === 0) {
      status = 'cancelled';
    }
    if (status === 'success') successCount += 1;

    const baseEvent: RunTimelineEvent = {
      id: `evt-${order.toString().padStart(4, '0')}`,
      runId: RUN_ID,
      threadId: THREAD_ID,
      type,
      status,
      ts: startedAt,
      startedAt,
      endedAt,
      durationMs: 45_000,
      nodeId: `node-${(i % 4) + 1}`,
      sourceKind: 'internal',
      sourceSpanId: `span-${order}`,
      metadata: { order },
      errorCode: status === 'error' ? 'event_error' : null,
      errorMessage: status === 'error' ? 'Event failure' : null,
      attachments: [],
    };

    if (type === 'tool_execution') {
      baseEvent.toolExecution = {
        toolName: `tool-${(i % 3) + 1}`,
        toolCallId: `call-${order}`,
        execStatus: status === 'error' ? 'error' : 'success',
        input: { value: order },
        output: status === 'error' ? null : { result: order * 2 },
        errorMessage: status === 'error' ? 'Tool failed' : null,
        raw: null,
      };
    } else if (type === 'llm_call') {
      baseEvent.llmCall = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0.2,
        topP: 1,
        stopReason: status === 'error' ? 'max_tokens' : 'stop',
        contextItemIds: [`ctx-${order}`],
        responseText: status === 'error' ? null : `Response ${order}`,
        rawResponse: null,
        toolCalls: [],
      };
    } else if (type === 'summarization') {
      baseEvent.summarization = {
        summaryText: `Summary ${order}`,
        newContextCount: (order % 5) + 1,
        oldContextTokens: 120 + order,
        raw: null,
      };
    } else if (type === 'injection') {
      baseEvent.injection = {
        messageIds: [`msg-${order}`],
        reason: 'Injected for testing',
      };
    } else if (type === 'invocation_message') {
      baseEvent.message = {
        messageId: `msg-${order}`,
        role: 'assistant',
        kind: null,
        text: `Message ${order}`,
        source: null,
        createdAt: startedAt,
      };
    }

    events.push(baseEvent);
    byId.set(baseEvent.id, baseEvent);
  }

  if (successCount <= 100) {
    throw new Error('Dataset must include more than 100 success events for filter coverage');
  }

  const countsByType = events.reduce<Record<RunEventType, number>>(
    (acc, event) => {
      acc[event.type] += 1;
      return acc;
    },
    {
      invocation_message: 0,
      injection: 0,
      llm_call: 0,
      tool_execution: 0,
      summarization: 0,
    },
  );

  const countsByStatus = events.reduce<Record<RunEventStatus, number>>(
    (acc, event) => {
      acc[event.status] += 1;
      return acc;
    },
    {
      pending: 0,
      running: 0,
      success: 0,
      error: 0,
      cancelled: 0,
    },
  );

  const summary: RunTimelineSummary = {
    runId: RUN_ID,
    threadId: THREAD_ID,
    status: 'running',
    createdAt: events[Math.max(0, events.length - 1)]?.startedAt ?? new Date(BASE_TIME).toISOString(),
    updatedAt: events[0]?.endedAt ?? new Date(BASE_TIME).toISOString(),
    firstEventAt: events[Math.max(0, events.length - 1)]?.ts ?? null,
    lastEventAt: events[0]?.ts ?? null,
    countsByType,
    countsByStatus,
    totalEvents: events.length,
  };

  return { events, summary, byId, successCount };
}

function registerTimelineHandlers(events: RunTimelineEvent[], summary: RunTimelineSummary) {
  const requestLog: RequestLog[] = [];
  let firstPageOldest: RunTimelineEvent | null = null;

  const summaryResolver = () => _HttpResponse.json(summary);

  const eventsResolver = ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 100;
    const orderParam = url.searchParams.get('order');
    const order = orderParam === 'desc' ? 'desc' : 'asc';
    const cursorTs = url.searchParams.get('cursor[ts]');
    const cursorId = url.searchParams.get('cursor[id]');
    const typesParam = url.searchParams.get('types');
    const statusesParam = url.searchParams.get('statuses');

    requestLog.push({ limit: limitParam, order: orderParam, cursorTs, cursorId, types: typesParam, statuses: statusesParam });

    const typeFilter = typesParam ? typesParam.split(',').filter(Boolean) : [];
    const statusFilter = statusesParam ? statusesParam.split(',').filter(Boolean) : [];

    const ordered = order === 'desc' ? events : [...events].reverse();
    const filtered = ordered.filter((event) => {
      const typeOk = typeFilter.length === 0 || typeFilter.includes(event.type);
      const statusOk = statusFilter.length === 0 || statusFilter.includes(event.status);
      return typeOk && statusOk;
    });

    let startIndex = 0;
    if (cursorTs && cursorId) {
      const cursorIndex = filtered.findIndex((event) => event.ts === cursorTs && event.id === cursorId);
      if (cursorIndex >= 0) startIndex = cursorIndex + 1;
    }

    const items = filtered.slice(startIndex, startIndex + limit);
    if (!cursorTs) {
      firstPageOldest = items.length > 0 ? items[items.length - 1] : null;
    }

    const lastItem = items[items.length - 1];
    const nextCursor = items.length > 0 && startIndex + items.length < filtered.length
      ? { ts: lastItem.ts, id: lastItem.id }
      : null;

    return _HttpResponse.json({ items, nextCursor });
  };

  server.use(
    _http.get(abs('/api/agents/runs/:runId/summary'), summaryResolver),
    _http.get('/api/agents/runs/:runId/summary', summaryResolver),
    _http.get(abs('/api/agents/runs/:runId/events'), eventsResolver),
    _http.get('/api/agents/runs/:runId/events', eventsResolver),
  );

  return {
    requests: requestLog,
    getFirstPageOldest: () => firstPageOldest,
  };
}

function renderTimeline() {
  render(
    <TestProviders>
      <MemoryRouter initialEntries={[`/agents/threads/${THREAD_ID}/runs/${RUN_ID}/timeline`]}>
        <Routes>
          <Route path="/agents/threads/:threadId/runs/:runId/timeline" element={<AgentsRunTimeline />} />
        </Routes>
      </MemoryRouter>
    </TestProviders>,
  );
}

describe('AgentsRunTimeline integration (MSW)', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('loads latest 100 events, allows loading older history, and keeps items across refresh', async () => {
    const { events, summary, byId } = buildTimelineDataset(150);
    const oldestEvent = events[events.length - 1];
    const { requests, getFirstPageOldest } = registerTimelineHandlers(events, summary);

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    try {
      renderTimeline();

      const listbox = await screen.findByRole('listbox');
      Object.defineProperty(listbox, 'scrollHeight', { configurable: true, value: 3200 });
      Object.defineProperty(listbox, 'scrollTop', { configurable: true, value: 0, writable: true });

      await waitFor(() => expect(requests.length).toBeGreaterThanOrEqual(1));
      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(100));

      const initialRequest = requests[0];

      const firstPageCursor = getFirstPageOldest();
      expect(firstPageCursor).not.toBeNull();
      expect(firstPageCursor && byId.get(firstPageCursor.id)).toBeDefined();

      await waitFor(() => expect(listbox.scrollTop).toBe(3200));

      expect(initialRequest).toMatchObject({
        limit: '100',
        order: 'desc',
        cursorTs: null,
        cursorId: null,
      });

      const loadOlderButton = await screen.findByRole('button', { name: /load older events/i });
      const requestsBeforeOlder = requests.length;
      await userEvent.click(loadOlderButton);

      await waitFor(() => expect(requests.length).toBeGreaterThan(requestsBeforeOlder));
      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(150));

      const loadOlderRequest = requests[requestsBeforeOlder];

      expect(loadOlderRequest).toMatchObject({
        limit: '100',
        order: 'desc',
        cursorTs: firstPageCursor?.ts ?? null,
        cursorId: firstPageCursor?.id ?? null,
      });

      const optionsAfterLoad = screen.getAllByRole('option');
      expect(optionsAfterLoad[0]).toHaveAttribute('data-event-id', oldestEvent.id);
      expect(optionsAfterLoad[optionsAfterLoad.length - 1]).toHaveAttribute('data-event-id', events[0].id);

      await waitFor(() => expect(screen.getByText(/beginning of timeline/i)).toBeInTheDocument());

      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      const requestsBeforeRefresh = requests.length;
      await userEvent.click(refreshButton);

      await waitFor(() => expect(requests.length).toBeGreaterThan(requestsBeforeRefresh));
      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(150));

      const refreshRequest = requests[requestsBeforeRefresh];

      expect(refreshRequest).toMatchObject({
        limit: '100',
        order: 'desc',
        cursorTs: null,
        cursorId: null,
      });
    } finally {
      rafSpy.mockRestore();
    }
  });

  it('respects active filters for status paging and keeps filtered events when loading older items', async () => {
    const { events, summary, byId, successCount } = buildTimelineDataset(160);
    const { requests, getFirstPageOldest } = registerTimelineHandlers(events, summary);

    renderTimeline();

    await waitFor(() => expect(requests.length).toBeGreaterThanOrEqual(1));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(100));

    const successFilter = screen.getByRole('button', { name: /^success$/i });
    await userEvent.click(successFilter);

    await waitFor(() => expect(requests.length).toBeGreaterThan(1));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(100));

    const filteredCursor = getFirstPageOldest();
    expect(filteredCursor).not.toBeNull();

    const loadOlderButton = await screen.findByRole('button', { name: /load older events/i });
    const requestsBeforeFilteredOlder = requests.length;
    await userEvent.click(loadOlderButton);

    await waitFor(() => expect(requests.length).toBeGreaterThan(requestsBeforeFilteredOlder));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(successCount));

    const optionIds = screen.getAllByRole('option').map((node) => node.getAttribute('data-event-id'));
    for (const id of optionIds) {
      expect(id).not.toBeNull();
      const event = id ? byId.get(id) : null;
      expect(event?.status).toBe('success');
    }

    const filterRequest = requests[1];
    expect(filterRequest).toMatchObject({
      limit: '100',
      order: 'desc',
      statuses: 'success',
    });

    const filteredLoadOlderRequest = requests[requestsBeforeFilteredOlder];
    expect(filteredLoadOlderRequest).toMatchObject({
      limit: '100',
      order: 'desc',
      statuses: 'success',
      cursorTs: filteredCursor?.ts ?? null,
      cursorId: filteredCursor?.id ?? null,
    });
  });
});
