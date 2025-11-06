import { httpJson } from '@/api/client';
import type { ThreadNode } from '@/api/types/agents';

export const threads = {
  roots: async (status: 'open' | 'closed' | 'all' = 'open', limit = 100) =>
    (await httpJson<{ items: ThreadNode[] }>(`/api/agents/threads?rootsOnly=true&status=${encodeURIComponent(status)}&limit=${limit}`)) ?? { items: [] },
  children: async (id: string, status: 'open' | 'closed' | 'all' = 'open') =>
    (await httpJson<{ items: ThreadNode[] }>(`/api/agents/threads/${encodeURIComponent(id)}/children?status=${encodeURIComponent(status)}`)) ?? { items: [] },
  patchStatus: async (id: string, status: 'open' | 'closed') => {
    await httpJson<void>(`/api/agents/threads/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },
};
