import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { PersistedGraphUpsertRequestUI } from './api';
import { graphSocket } from './socket';
import type { NodeStatus, NodeStatusEvent } from './types';

export function useTemplates() {
  return useQuery({
    queryKey: ['graph', 'templates'],
    queryFn: () => api.getTemplates(),
    staleTime: 1000 * 60 * 60, // 1h
  });
}

import { notifyError } from '../notify';

export function useNodeStatus(nodeId: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['graph', 'node', nodeId, 'status'],
    queryFn: () => api.getNodeStatus(nodeId),
    staleTime: Infinity,
  });

  useEffect(() => {
    graphSocket.connect();
    const off = graphSocket.onNodeStatus(nodeId, (ev: NodeStatusEvent) => {
      // Authoritative event overwrites optimistic cache
      qc.setQueryData<NodeStatus>(['graph', 'node', nodeId, 'status'], (prev) => ({ ...(prev || {}), ...ev }));
    });
    return () => off();
  }, [nodeId, qc]);

  return q;
}

export function useNodeAction(nodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'provision' | 'deprovision') => api.postNodeAction(nodeId, action),
    onMutate: async (action) => {
      await qc.cancelQueries({ queryKey: ['graph', 'node', nodeId, 'status'] });
      const key = ['graph', 'node', nodeId, 'status'] as const;
      const prev = qc.getQueryData<NodeStatus>(key);
      // Optimistic update rules
      let optimistic: Partial<NodeStatus> = {};
      if (action === 'provision') optimistic = { provisionStatus: { state: 'provisioning' as const }, isPaused: false };
      if (action === 'deprovision')
        optimistic = { provisionStatus: { state: 'deprovisioning' as const }, isPaused: false };
      if (action === 'pause') optimistic = { isPaused: true };
      if (action === 'resume') optimistic = { isPaused: false };
      qc.setQueryData(key, { ...(prev || {}), ...optimistic });
      return { prev };
    },
    onError: (err: unknown, _action, ctx) => {
      if (ctx?.prev) qc.setQueryData(['graph', 'node', nodeId, 'status'], ctx.prev);
      const message = err instanceof Error ? err.message : String(err);
      notifyError(`Action failed: ${message}`);
    },
  });
}

// New: full graph save hook
export function useSaveGraph() {
  return useMutation({
    mutationFn: (graph: PersistedGraphUpsertRequestUI) => api.saveFullGraph(graph),
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      notifyError(`Save graph failed: ${message}`);
    },
  });
}

// Temporary adapter preserving existing component API; expects caller to supply full graph via updater
export function useSetNodeConfig(nodeId: string) {
  return useMutation({
    mutationFn: async (cfg: Record<string, unknown>) => {
      // Fetch current graph from API
      const graph = await (await fetch(`${location.protocol}//${location.hostname}:3010/api/graph`)).json();
      const typed: PersistedGraphUpsertRequestUI = {
        name: graph.name,
        version: graph.version,
        nodes: graph.nodes,
        edges: graph.edges,
      };
      const node = typed.nodes.find((n) => n.id === nodeId);
      if (node) node.config = cfg; // replace config
      return api.saveFullGraph(typed);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      notifyError(`Save config failed: ${message}`);
    },
  });
}
