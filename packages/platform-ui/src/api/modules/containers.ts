import { httpJson } from '@/api/client';

export type ContainerItem = {
  containerId: string;
  threadId: string | null;
  role: string;
  image: string;
  status: 'running' | 'stopped' | 'terminating' | 'failed';
  startedAt: string;
  lastUsedAt: string;
  killAfterAt: string | null;
};

export async function listContainers(params: { status?: string; sortBy?: string; sortDir?: string; threadId?: string }) {
  const sp = new URLSearchParams();
  if (params.status) sp.set('status', params.status);
  if (params.sortBy) sp.set('sortBy', params.sortBy);
  if (params.sortDir) sp.set('sortDir', params.sortDir);
  if (params.threadId) sp.set('threadId', params.threadId);
  const res = await httpJson<{ items: ContainerItem[] }>(`/api/containers?${sp.toString()}`);
  return res ?? { items: [] };
}
