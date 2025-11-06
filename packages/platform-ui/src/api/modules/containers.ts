import { http } from '@/api/http';

export type ContainerItem = {
  containerId: string;
  threadId: string | null;
  image: string;
  status: 'running' | 'stopped' | 'terminating' | 'failed';
  startedAt: string;
  lastUsedAt: string;
  killAfterAt: string | null;
};

export function listContainers(params: { status?: string; sortBy?: string; sortDir?: string }) {
  return http.get<{ items: ContainerItem[] }>(`/api/containers`, { params });
}

