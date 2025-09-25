import type { NodeStatus, TemplateSchema } from './types';
// Minimal graph type (align with backend PersistedGraphUpsertRequest shape)
export interface PersistedGraphUpsertRequestUI {
  name?: string;
  version?: number;
  nodes: Array<{ id: string; position?: { x: number; y: number }; template: string; config?: Record<string, unknown> }>;
  edges: Array<{ source: string; sourceHandle?: string; target: string; targetHandle?: string }>;
}
// Base host for graph API; override via VITE_GRAPH_API_BASE
interface ViteEnv { VITE_GRAPH_API_BASE?: string }
const envHost = (typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: ViteEnv }).env?.VITE_GRAPH_API_BASE : undefined);
const BASE = envHost || 'http://localhost:3010';

async function http<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as unknown as T;
  try {
    return (await res.json()) as T;
  } catch {
    return undefined as unknown as T;
  }
}

export const api = {
  getTemplates: () => http<TemplateSchema[]>(`${BASE}/graph/templates`),
  getNodeStatus: (nodeId: string) => http<NodeStatus>(`${BASE}/graph/nodes/${encodeURIComponent(nodeId)}/status`),
  postNodeAction: (nodeId: string, action: 'pause' | 'resume' | 'provision' | 'deprovision') =>
    http<void>(`${BASE}/graph/nodes/${encodeURIComponent(nodeId)}/actions`, { method: 'POST', body: JSON.stringify({ action }) }),
  saveFullGraph: (graph: PersistedGraphUpsertRequestUI) =>
    http<PersistedGraphUpsertRequestUI & { version: number; updatedAt: string }>(`${BASE}/api/graph`, {
      method: 'POST',
      body: JSON.stringify(graph),
    }),
};
