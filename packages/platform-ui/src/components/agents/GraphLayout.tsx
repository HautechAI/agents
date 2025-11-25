import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addEdge, applyEdgeChanges, applyNodeChanges, type Edge, type Node } from '@xyflow/react';

import { GraphCanvas, type GraphNodeData } from '../GraphCanvas';
import EmptySelectionSidebar from '../EmptySelectionSidebar';
import NodePropertiesSidebar from '../NodePropertiesSidebar';

import { useGraphData } from '@/features/graph/hooks/useGraphData';
import { useGraphSocket } from '@/features/graph/hooks/useGraphSocket';
import { useNodeStatus } from '@/features/graph/hooks/useNodeStatus';
import { useNodeState } from '@/features/graph/hooks/useNodeState';
import type { GraphNodeConfig, GraphNodeStatus, GraphPersistedEdge } from '@/features/graph/types';
import type { NodeStatus as ApiNodeStatus } from '@/api/types/graph';
import { graph as graphApi } from '@/api/modules/graph';
import { notifyError, notifySuccess } from '@/lib/notify';

type FlowNode = Node<GraphNodeData>;

interface NodeRunSummary {
  runId: string;
  threadId: string;
  status: string;
  updatedAt: string;
}

function toFlowNode(node: GraphNodeConfig, selectedId: string | null): FlowNode {
  return {
    id: node.id,
    type: 'graphNode',
    position: { x: node.x, y: node.y },
    data: {
      kind: node.kind,
      title: node.title,
      inputs: node.ports.inputs,
      outputs: node.ports.outputs,
      avatarSeed: node.avatarSeed,
    },
    selected: node.id === selectedId,
  } satisfies FlowNode;
}

function toFlowEdge(edge: GraphPersistedEdge): Edge {
  const id = `${edge.source}-${edge.sourceHandle ?? '$'}__${edge.target}-${edge.targetHandle ?? '$'}`;
  return {
    id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
  } satisfies Edge;
}

function mapProvisionState(status?: ApiNodeStatus): GraphNodeStatus | undefined {
  const state = status?.provisionStatus?.state;
  switch (state) {
    case 'ready':
      return 'ready';
    case 'provisioning':
      return 'provisioning';
    case 'deprovisioning':
      return 'deprovisioning';
    case 'provisioning_error':
      return 'provisioning_error';
    case 'deprovisioning_error':
      return 'deprovisioning_error';
    case 'error':
      return 'provisioning_error';
    case 'not_ready':
    default:
      return state ? 'not_ready' : undefined;
  }
}

export function GraphLayout() {
  const {
    nodes,
    edges,
    loading,
    savingState,
    savingErrorMessage,
    updateNode,
    applyNodeStatus,
    applyNodeState,
  } = useGraphData();

  const nodeIds = useMemo(() => nodes.map((node) => node.id), [nodes]);

  useGraphSocket({
    nodeIds,
    onStatus: (event) => {
      const { nodeId, updatedAt: _ignored, ...status } = event;
      applyNodeStatus(nodeId, status);
    },
    onState: (event) => {
      applyNodeState(event.nodeId, event.state ?? {});
    },
  });

  const [flowNodes, setFlowNodes] = useState<FlowNode[]>([]);
  const [flowEdges, setFlowEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [runs, setRuns] = useState<NodeRunSummary[]>([]);
  const [terminatingRunIds, setTerminatingRunIds] = useState<Set<string>>(new Set());
  const [terminatingThreadIds, setTerminatingThreadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    if (!selectedNodeId && nodes.length > 0) {
      setSelectedNodeId(nodes[0].id);
      return;
    }
    if (selectedNodeId && !nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(nodes[0]?.id ?? null);
    }
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    setFlowNodes((prev) => {
      return nodes.map((node) => {
        const existing = prev.find((item) => item.id === node.id);
        const base = toFlowNode(node, selectedNodeIdRef.current);
        if (existing) {
          base.position = existing.position;
        }
        return base;
      });
    });
  }, [nodes]);

  useEffect(() => {
    setFlowNodes((prev) => prev.map((node) => ({ ...node, selected: node.id === selectedNodeId })));
  }, [selectedNodeId]);

  useEffect(() => {
    setFlowEdges(edges.map(toFlowEdge));
  }, [edges]);

  const selectedNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) ?? null : null;

  const statusQuery = useNodeStatus(selectedNodeId ?? '');
  const nodeState = useNodeState(selectedNodeId ?? '', {
    onUpdated: (nextState) => {
      const nodeId = selectedNodeIdRef.current;
      if (nodeId) {
        updateNode(nodeId, { state: nextState });
      }
    },
  });

  const nodeStateValue = nodeState.state;
  const nodeStateQuery = nodeState.query;
  const updateNodeState = nodeState.updateState;

  const mcpTools = useMemo(() => {
    const baseState = nodeStateValue ?? {};
    const mcp = baseState && typeof baseState === 'object' ? (baseState as Record<string, unknown>).mcp : undefined;
    if (!mcp || typeof mcp !== 'object') {
      return { tools: [] as Array<{ name: string; title?: string; description?: string }>, enabledTools: undefined as string[] | undefined };
    }
    const record = mcp as Record<string, unknown>;
    const toolsRaw = record.tools;
    const tools = Array.isArray(toolsRaw)
      ? toolsRaw
          .filter((tool): tool is Record<string, unknown> => !!tool && typeof tool === 'object')
          .filter((tool) => typeof tool.name === 'string')
          .map((tool) => ({
            name: String(tool.name),
            title: typeof tool.title === 'string' ? tool.title : undefined,
            description: typeof tool.description === 'string' ? tool.description : undefined,
          }))
      : [];
    const enabledRaw = record.enabledTools;
    const enabledTools = Array.isArray(enabledRaw)
      ? enabledRaw.filter((value): value is string => typeof value === 'string')
      : undefined;
    return { tools, enabledTools };
  }, [nodeStateValue]);

  useEffect(() => {
    setTerminatingRunIds(new Set());
    setTerminatingThreadIds(new Set());
  }, [selectedNodeId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function loadRuns() {
      if (!selectedNodeId || selectedNode?.kind !== 'Agent') {
        setRuns([]);
        return;
      }
      try {
        const res = await graphApi.listNodeRuns(selectedNodeId, 'all');
        if (cancelled) return;
        const items = Array.isArray(res?.items) ? res.items : [];
        setRuns(
          items.map((item) => ({
            runId: item.runId,
            threadId: item.threadId,
            status: item.status,
            updatedAt: item.updatedAt,
          })),
        );
      } catch {
        // swallow API errors; polling will retry
      } finally {
        if (!cancelled && selectedNode?.kind === 'Agent') {
          timer = setTimeout(loadRuns, 4000);
        }
      }
    }

    loadRuns();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [selectedNodeId, selectedNode?.kind]);

  const handleNodesChange = useCallback((changes: Parameters<typeof applyNodeChanges>[0]) => {
    let nextSelectedId = selectedNodeIdRef.current;
    for (const change of changes) {
      if (change.type === 'select' && 'id' in change) {
        nextSelectedId = change.selected ? change.id : null;
      }
    }
    setSelectedNodeId(nextSelectedId ?? null);
    setFlowNodes((prev) => {
      const applied = applyNodeChanges(changes, prev) as FlowNode[];
      return applied.map((node) => ({ ...node, selected: node.id === (nextSelectedId ?? null) }));
    });
  }, []);

  const handleEdgesChange = useCallback((changes: Parameters<typeof applyEdgeChanges>[0]) => {
    setFlowEdges((prev) => applyEdgeChanges(changes, prev));
  }, []);

  const handleConnect = useCallback((connection: Parameters<typeof addEdge>[0]) => {
    setFlowEdges((prev) => addEdge(connection, prev));
  }, []);

  const runtimeState = mapProvisionState(statusQuery.data) ??
    selectedNode?.runtime?.provisionStatus?.state ??
    selectedNode?.status ??
    'not_ready';

  const runtimeDetails = statusQuery.data?.provisionStatus?.details ?? selectedNode?.runtime?.provisionStatus?.details;
  const isPaused = statusQuery.data?.isPaused ?? selectedNode?.runtime?.isPaused ?? false;

  const handleTitleChange = useCallback(
    (title: string) => {
      const nodeId = selectedNodeIdRef.current;
      if (!nodeId) return;
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) return;
      const nextConfig = { ...(node.config ?? {}), title };
      updateNode(nodeId, { title, config: nextConfig });
    },
    [nodes, updateNode],
  );

  const handleConfigChange = useCallback(
    (nextConfig: Record<string, unknown>) => {
      const nodeId = selectedNodeIdRef.current;
      if (!nodeId) return;
      updateNode(nodeId, { config: nextConfig });
    },
    [updateNode],
  );

  const handleToggleTool = useCallback(
    async (toolName: string, enabled: boolean) => {
      const nodeId = selectedNodeIdRef.current;
      if (!nodeId) return;
      const current = new Set(mcpTools.enabledTools ?? []);
      if (enabled) {
        current.add(toolName);
      } else {
        current.delete(toolName);
      }
      const stateRecord = nodeStateValue ?? {};
      const rawMcp = stateRecord && typeof stateRecord === 'object' && 'mcp' in stateRecord ? (stateRecord as Record<string, unknown>).mcp : undefined;
      const mcpRecord = rawMcp && typeof rawMcp === 'object' ? (rawMcp as Record<string, unknown>) : {};
      const nextState = {
        ...stateRecord,
        mcp: { ...mcpRecord, enabledTools: Array.from(current) },
      } as Record<string, unknown>;
      try {
        await updateNodeState(nextState);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notifyError(`Failed to update MCP tools: ${message}`);
      }
    },
    [mcpTools.enabledTools, nodeStateValue, updateNodeState],
  );

  const handleProvision = useCallback(async () => {
    const nodeId = selectedNodeIdRef.current;
    if (!nodeId) return;
    const node = nodes.find((item) => item.id === nodeId);
    if (!node || actionPending) return;
    const previousStatus = node.status;
    const previousRuntime = node.runtime;
    setActionPending(true);
    updateNode(nodeId, {
      status: 'provisioning',
      runtime: {
        ...(previousRuntime ?? {}),
        provisionStatus: { state: 'provisioning', details: previousRuntime?.provisionStatus?.details },
        isPaused: false,
      },
    });
    try {
      await graphApi.postNodeAction(nodeId, 'provision');
    } catch (error) {
      updateNode(nodeId, {
        status: previousStatus,
        runtime: previousRuntime,
      });
      const message = error instanceof Error ? error.message : String(error);
      notifyError(`Action failed: ${message}`);
    } finally {
      setActionPending(false);
    }
  }, [actionPending, nodes, updateNode]);

  const handleDeprovision = useCallback(async () => {
    const nodeId = selectedNodeIdRef.current;
    if (!nodeId) return;
    const node = nodes.find((item) => item.id === nodeId);
    if (!node || actionPending) return;
    const previousStatus = node.status;
    const previousRuntime = node.runtime;
    setActionPending(true);
    updateNode(nodeId, {
      status: 'deprovisioning',
      runtime: {
        ...(previousRuntime ?? {}),
        provisionStatus: { state: 'deprovisioning', details: previousRuntime?.provisionStatus?.details },
        isPaused: false,
      },
    });
    try {
      await graphApi.postNodeAction(nodeId, 'deprovision');
    } catch (error) {
      updateNode(nodeId, {
        status: previousStatus,
        runtime: previousRuntime,
      });
      const message = error instanceof Error ? error.message : String(error);
      notifyError(`Action failed: ${message}`);
    } finally {
      setActionPending(false);
    }
  }, [actionPending, nodes, updateNode]);

  const handleTerminateRun = useCallback(
    async (runId: string) => {
      const ok = typeof window === 'undefined' ? true : window.confirm('Terminate this run?');
      if (!ok) return;
      setTerminatingRunIds((prev) => {
        const next = new Set(prev);
        next.add(runId);
        return next;
      });
      try {
        await graphApi.terminateRun(runId);
        notifySuccess('Termination signaled');
        setRuns((prev) => prev.map((run) => (run.runId === runId ? { ...run, status: 'terminating' } : run)));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notifyError(`Failed to terminate: ${message}`);
      } finally {
        setTerminatingRunIds((prev) => {
          const next = new Set(prev);
          next.delete(runId);
          return next;
        });
      }
    },
    [],
  );

  const handleTerminateThread = useCallback(
    async (threadId: string) => {
      const nodeId = selectedNodeIdRef.current;
      if (!nodeId) return;
      const ok = typeof window === 'undefined' ? true : window.confirm('Terminate this thread?');
      if (!ok) return;
      setTerminatingThreadIds((prev) => {
        const next = new Set(prev);
        next.add(threadId);
        return next;
      });
      try {
        await graphApi.terminateThread(nodeId, threadId);
        notifySuccess('Thread termination signaled');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notifyError(`Failed to terminate thread: ${message}`);
      } finally {
        setTerminatingThreadIds((prev) => {
          const next = new Set(prev);
          next.delete(threadId);
          return next;
        });
      }
    },
    [],
  );

  if (loading && nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading graph...
      </div>
    );
  }

  const sidebarRuns = selectedNode?.kind === 'Agent' ? runs : undefined;
  const sidebarTools = selectedNode?.kind === 'MCP' ? mcpTools.tools : undefined;
  const sidebarEnabledTools = selectedNode?.kind === 'MCP' ? mcpTools.enabledTools : undefined;

  return (
    <div className="flex h-full overflow-hidden bg-white">
      <div className="flex-1 relative bg-[var(--agyn-bg-light)] overflow-hidden">
        <GraphCanvas
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          savingStatus={savingState.status}
          savingErrorMessage={savingErrorMessage ?? undefined}
        />
      </div>
      {selectedNode ? (
        <NodePropertiesSidebar
          identity={{
            id: selectedNode.id,
            title: selectedNode.title,
            template: selectedNode.template,
            kind: selectedNode.kind,
          }}
          status={{
            status: selectedNode.status,
            runtimeState,
            runtimeDetails,
            isPaused,
          }}
          capabilities={selectedNode.capabilities}
          config={selectedNode.config ?? {}}
          onConfigChange={handleConfigChange}
          onTitleChange={handleTitleChange}
          state={selectedNode.state ?? {}}
          tools={sidebarTools}
          enabledTools={sidebarEnabledTools}
          onToggleTool={selectedNode.kind === 'MCP' ? handleToggleTool : undefined}
          toolsLoading={nodeStateQuery.isPending}
          runs={sidebarRuns}
          actions={{
            onProvision: handleProvision,
            onDeprovision: handleDeprovision,
            onTerminateRun: selectedNode.kind === 'Agent' ? handleTerminateRun : undefined,
            onTerminateThread: selectedNode.kind === 'Agent' ? handleTerminateThread : undefined,
            actionPending,
            terminatingRunIds,
            terminatingThreadIds,
          }}
        />
      ) : (
        <EmptySelectionSidebar />
      )}
    </div>
  );
}
