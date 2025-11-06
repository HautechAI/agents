import { httpJson } from '@/api/client';
import type { RunMessageItem, RunMeta } from '@/api/types/agents';

export const runs = {
  listByThread: async (threadId: string) =>
    (await httpJson<{ items: RunMeta[] }>(`/api/agents/threads/${encodeURIComponent(threadId)}/runs`)) ?? { items: [] },
  messages: async (runId: string, type: 'input' | 'injected' | 'output') =>
    (await httpJson<{ items: RunMessageItem[] }>(`/api/agents/runs/${encodeURIComponent(runId)}/messages?type=${encodeURIComponent(type)}`)) ?? { items: [] },
};
