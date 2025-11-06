import { http } from '@/api/http';
import type { RunMessageItem, RunMeta } from '@/api/types/agents';

export const runs = {
  listByThread: (threadId: string) => http.get<{ items: RunMeta[] }>(`/api/agents/threads/${encodeURIComponent(threadId)}/runs`),
  messages: (runId: string, type: 'input' | 'injected' | 'output') =>
    http.get<{ items: RunMessageItem[] }>(`/api/agents/runs/${encodeURIComponent(runId)}/messages`, { params: { type } }),
};

