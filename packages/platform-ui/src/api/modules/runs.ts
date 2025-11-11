import { http, asData } from '@/api/http';
import type { RunMessageItem, RunMeta, RunTimelineEvent, RunTimelineSummary } from '@/api/types/agents';

export const runs = {
  listByThread: (threadId: string) => asData<{ items: RunMeta[] }>(
    http.get<{ items: RunMeta[] }>(`/api/agents/threads/${encodeURIComponent(threadId)}/runs`),
  ),
  messages: (runId: string, type: 'input' | 'injected' | 'output') =>
    asData<{ items: RunMessageItem[] }>(
      http.get<{ items: RunMessageItem[] }>(`/api/agents/runs/${encodeURIComponent(runId)}/messages`, { params: { type } }),
    ),
  timelineSummary: (runId: string) =>
    asData<RunTimelineSummary>(http.get<RunTimelineSummary>(`/api/agents/runs/${encodeURIComponent(runId)}/timeline/summary`)),
  timelineEvents: (runId: string, params: { types?: string; statuses?: string; limit?: number }) =>
    asData<{ items: RunTimelineEvent[] }>(
      http.get<{ items: RunTimelineEvent[] }>(`/api/agents/runs/${encodeURIComponent(runId)}/timeline/events`, { params }),
    ),
};
