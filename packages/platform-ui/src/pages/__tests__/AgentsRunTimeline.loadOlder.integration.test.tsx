import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentsRunTimeline } from '../AgentsRunTimeline';
import type { RunTimelineEvent } from '@/api/types/agents';

type TimelinePageInput = {
  cursor: { ts: string; id: string } | null;
  items: RunTimelineEvent[];
  nextCursor: { ts: string; id: string } | null;
};

type TimelineControls = {
  reset(): void;
  prime(input: { runId: string; threadId: string; pages: TimelinePageInput[] }): void;
};

type TimelineRequest = {
  runId: string;
  url: string;
  params: Record<string, string>;
};

type TimelineRequestControls = {
  reset(): void;
  snapshot(): TimelineRequest[];
};

const timeline = globalThis.__timeline as TimelineControls;
const timelineRequests = globalThis.__timelineRequests as TimelineRequestControls;

const runId = 'run-integration';
const threadId = 'thread-integration';
const PAGE_SIZE = 100;
const TOTAL_EVENTS = 150;

const baseTimestamp = new Date('2024-02-01T00:00:00.000Z').getTime();

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/agents/threads/${threadId}/runs/${runId}`]}>
      <QueryClientProvider client={createQueryClient()}>
        <Routes>
          <Route path="/agents/threads/:threadId/runs/:runId" element={<AgentsRunTimeline />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );

const setMatchMedia = (matches: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
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
};

const buildEvent = (index: number): RunTimelineEvent => {
  const id = `evt_${index.toString().padStart(3, '0')}`;
  const ts = new Date(baseTimestamp + index * 1000).toISOString();
  return {
    id,
    runId,
    threadId,
    type: 'tool_execution',
    status: 'success',
    ts,
    startedAt: ts,
    endedAt: ts,
    durationMs: 0,
    nodeId: null,
    sourceKind: 'internal',
    sourceSpanId: null,
    metadata: {},
    errorCode: null,
    errorMessage: null,
    toolExecution: {
      toolName: 'demo',
      toolCallId: null,
      execStatus: 'success',
      input: {},
      output: {},
      errorMessage: null,
      raw: null,
    },
    attachments: [],
  };
};

const toCursor = (event: RunTimelineEvent) => ({ ts: event.ts, id: event.id });

describe('AgentsRunTimeline load older integration', () => {
  beforeEach(() => {
    setMatchMedia(true);
    timeline.reset();
    timelineRequests.reset();
  });

  it('requests older pages via bracketed cursor params and merges results without duplicates', async () => {
    const events = Array.from({ length: TOTAL_EVENTS }, (_, index) => buildEvent(index));
    const newestPage = events.slice(TOTAL_EVENTS - PAGE_SIZE).reverse();
    const oldestFromNewest = newestPage.at(-1)!;
    const nextCursor = toCursor(oldestFromNewest);
    const olderPage = events.slice(0, TOTAL_EVENTS - PAGE_SIZE).reverse();

    timeline.prime({
      runId,
      threadId,
      pages: [
        { cursor: null, items: newestPage, nextCursor },
        { cursor: nextCursor, items: olderPage, nextCursor: null },
      ],
    });

    renderPage();

    const list = await screen.findByTestId('agents-run-timeline-scroll');
    const metrics = { client: 500, height: 3200, top: 0 };

    Object.defineProperty(list, 'clientHeight', {
      configurable: true,
      get: () => metrics.client,
    });
    Object.defineProperty(list, 'scrollHeight', {
      configurable: true,
      get: () => metrics.height,
      set: (value: number) => {
        metrics.height = value;
      },
    });
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      get: () => metrics.top,
      set: (value: number) => {
        metrics.top = value;
      },
    });

    await waitFor(() => expect(document.querySelectorAll('[data-event-id]').length).toBe(PAGE_SIZE));
    await waitFor(() => expect(metrics.top).toBe(metrics.height));

    await waitFor(() => expect(timelineRequests.snapshot().length).toBe(1));
    const [initialRequest] = timelineRequests.snapshot();
    expect(initialRequest.params.limit).toBe(String(PAGE_SIZE));
    expect(initialRequest.params.order).toBe('desc');
    expect(initialRequest.params['cursor[ts]']).toBeUndefined();
    expect(initialRequest.params['cursor[id]']).toBeUndefined();

    timelineRequests.reset();

    const loadOlderButton = await screen.findByTestId('timeline-load-older');
    expect(loadOlderButton).not.toBeDisabled();

    const previousHeight = metrics.height;
    const previousTop = 160;
    metrics.top = previousTop;
    const nextHeight = previousHeight + 600;

    await act(async () => {
      fireEvent.click(loadOlderButton);
      metrics.height = nextHeight;
    });

    await waitFor(() => expect(timelineRequests.snapshot().length).toBe(1));
    const [olderRequest] = timelineRequests.snapshot();
    expect(olderRequest.params.limit).toBe(String(PAGE_SIZE));
    expect(olderRequest.params.order).toBe('desc');
    expect(olderRequest.params['cursor[ts]']).toBe(nextCursor.ts);
    expect(olderRequest.params['cursor[id]']).toBe(nextCursor.id);

    await waitFor(() => expect(document.querySelectorAll('[data-event-id]').length).toBe(TOTAL_EVENTS));

    const renderedNodes = Array.from(document.querySelectorAll('[data-event-id]'));
    const renderedIds = renderedNodes.map((node) => node.getAttribute('data-event-id') as string);
    expect(new Set(renderedIds).size).toBe(renderedIds.length);

    const expectedOrder = [...events]
      .sort((a, b) => {
        const timeDiff = a.ts.localeCompare(b.ts);
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
      })
      .map((event) => event.id);
    expect(renderedIds).toEqual(expectedOrder);

    const expectedTop = previousTop + (nextHeight - previousHeight);
    await waitFor(() => expect(metrics.top).toBe(expectedTop));

    await waitFor(() => expect(loadOlderButton).toBeDisabled());
  });
});
