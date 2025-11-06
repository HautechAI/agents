import { http } from '@/api/http';
import type { ThreadNode } from '@/api/types/agents';

export const threads = {
  roots: (status: 'open' | 'closed' | 'all' = 'open', limit = 100) =>
    http.get<{ items: ThreadNode[] }>(`/api/agents/threads`, { params: { rootsOnly: true, status, limit } }),
  children: (id: string, status: 'open' | 'closed' | 'all' = 'open') =>
    http.get<{ items: ThreadNode[] }>(`/api/agents/threads/${encodeURIComponent(id)}/children`, { params: { status } }),
  patchStatus: (id: string, status: 'open' | 'closed') =>
    http.patch(`/api/agents/threads/${encodeURIComponent(id)}`, { status }),
};

