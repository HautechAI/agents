import { http, asData } from '@/api/http';
import type {
  RunMessageItem,
  RunMeta,
  RunTimelineEvent,
  RunTimelineEventsCursor,
  RunTimelineEventsResponse,
  RunTimelineSummary,
} from '@/api/types/agents';

type UnknownRecord = Record<string, unknown>;

function toRecord(value: unknown): UnknownRecord {
  if (value && typeof value === 'object') {
    return value as UnknownRecord;
  }
  return {};
}

function coerceCursor(cursorLike: unknown): RunTimelineEventsCursor | null {
  const candidate = toRecord(cursorLike);
  const tsRaw = candidate.ts ?? candidate.timestamp ?? candidate.tsIso;
  const idRaw = candidate.id ?? candidate.cursorId ?? candidate.eventId;
  if (typeof tsRaw === 'string' && typeof idRaw === 'string' && tsRaw && idRaw) {
    return { ts: tsRaw, id: idRaw };
  }
  return null;
}

function normalizeTimelineEventsResponse(raw: unknown): RunTimelineEventsResponse {
  const topLevel = toRecord(raw);
  const payload = 'data' in topLevel && topLevel.data ? toRecord(topLevel.data) : topLevel;

  const page = toRecord(payload.page ?? payload.pagination ?? {});
  const itemsCandidate =
    payload.items ??
    payload.events ??
    page.items ??
    (Array.isArray(payload.data) ? payload.data : undefined);
  const items = Array.isArray(itemsCandidate) ? (itemsCandidate as RunTimelineEvent[]) : [];

  const nextCursor =
    coerceCursor(payload.nextCursor) ??
    coerceCursor(payload.next_cursor) ??
    coerceCursor(payload.next) ??
    coerceCursor(page.nextCursor ?? page.cursor ?? page.next) ??
    null;

  return {
    items,
    nextCursor,
  };
}

export const runs = {
  listByThread: (threadId: string) => asData<{ items: RunMeta[] }>(
    http.get<{ items: RunMeta[] }>(`/api/agents/threads/${encodeURIComponent(threadId)}/runs`),
  ),
  messages: (runId: string, type: 'input' | 'injected' | 'output') =>
    asData<{ items: RunMessageItem[] }>(
      http.get<{ items: RunMessageItem[] }>(`/api/agents/runs/${encodeURIComponent(runId)}/messages`, { params: { type } }),
    ),
  timelineSummary: (runId: string) =>
    asData<RunTimelineSummary>(http.get<RunTimelineSummary>(`/api/agents/runs/${encodeURIComponent(runId)}/summary`)),
  timelineEvents: async (
    runId: string,
    params: {
      types?: string;
      statuses?: string;
      limit?: number;
      order?: 'asc' | 'desc';
      cursor?: RunTimelineEventsCursor | null;
    },
  ) => {
    const raw = await http.get<unknown>(`/api/agents/runs/${encodeURIComponent(runId)}/events`, {
      params: {
        types: params.types,
        statuses: params.statuses,
        limit: params.limit,
        order: params.order,
        ...(params.cursor ? { 'cursor[ts]': params.cursor.ts, 'cursor[id]': params.cursor.id } : {}),
      },
    });
    return normalizeTimelineEventsResponse(raw);
  },
};
