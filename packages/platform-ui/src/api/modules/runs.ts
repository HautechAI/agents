import { http, asData } from '@/api/http';
import type {
  RunMessageItem,
  RunMeta,
  RunTimelineEventsCursor,
  RunTimelineEventsResponse,
  RunTimelineSummary,
} from '@/api/types/agents';

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
  timelineEvents: (
    runId: string,
    params: {
      types?: string;
      statuses?: string;
      limit?: number;
      order?: 'asc' | 'desc';
      cursor?: RunTimelineEventsCursor | null;
    },
  ) =>
    asData<RunTimelineEventsResponse>(
      http.get<RunTimelineEventsResponse>(`/api/agents/runs/${encodeURIComponent(runId)}/events`, {
        params: {
          types: params.types,
          statuses: params.statuses,
          limit: params.limit,
          order: params.order,
          ...(params.cursor ? { 'cursor[ts]': params.cursor.ts, 'cursor[id]': params.cursor.id } : {}),
        },
      }),
    ),
};
