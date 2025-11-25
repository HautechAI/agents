import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addEdge, applyEdgeChanges, applyNodeChanges, type Edge, type Node } from '@xyflow/react';

import { GraphCanvas, type GraphNodeData } from '../GraphCanvas';
import EmptySelectionSidebar from '../EmptySelectionSidebar';
import NodePropertiesSidebar, { type NodeConfig as SidebarNodeConfig } from '../NodePropertiesSidebar';

import { useGraphData } from '@/features/graph/hooks/useGraphData';
import { useGraphSocket } from '@/features/graph/hooks/useGraphSocket';
import { useNodeStatus } from '@/features/graph/hooks/useNodeStatus';
import type { GraphNodeConfig, GraphNodeStatus, GraphPersistedEdge } from '@/features/graph/types';
import type { NodeStatus as ApiNodeStatus } from '@/api/types/graph';

type FlowNode = Node<GraphNodeData>;

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

function encodeHandle(handle?: string | null): string {
  if (typeof handle === 'string' && handle.length > 0 && handle !== '$') {
    return handle;
  }
  return '$';
}

function decodeHandle(handle?: string | null): string | undefined {
  if (!handle || handle === '$') {
    return undefined;
  }
  return handle;
}

function buildEdgeId(
  source: string,
  sourceHandle: string | null | undefined,
  target: string,
  targetHandle: string | null | undefined,
): string {
  return `${source}-${encodeHandle(sourceHandle)}__${target}-${encodeHandle(targetHandle)}`;
}

function toFlowEdge(edge: GraphPersistedEdge): Edge {
  const sourceHandle = decodeHandle(edge.sourceHandle);
  const targetHandle = decodeHandle(edge.targetHandle);
  return {
    id: buildEdgeId(edge.source, sourceHandle, edge.target, targetHandle),
    source: edge.source,
    target: edge.target,
    sourceHandle,
    targetHandle,
  } satisfies Edge;
}

function fromFlowEdge(edge: Edge): GraphPersistedEdge {
  return {
    id: buildEdgeId(edge.source, edge.sourceHandle, edge.target, edge.targetHandle),
    source: edge.source,
    target: edge.target,
    sourceHandle: encodeHandle(edge.sourceHandle),
    targetHandle: encodeHandle(edge.targetHandle),
  } satisfies GraphPersistedEdge;
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
    setEdges,
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
  const flowNodesRef = useRef<FlowNode[]>([]);
  const flowEdgesRef = useRef<Edge[]>([]);

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
    flowNodesRef.current = flowNodes;
  }, [flowNodes]);

  useEffect(() => {
    const nextEdges = edges.map(toFlowEdge);
    flowEdgesRef.current = nextEdges;
    setFlowEdges(nextEdges);
  }, [edges]);

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) ?? null : null),
    [nodes, selectedNodeId],
  );

  const statusQuery = useNodeStatus(selectedNodeId ?? '');

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof applyNodeChanges>[0]) => {
      let nextSelectedId = selectedNodeIdRef.current;
      for (const change of changes) {
        if (change.type === 'select' && 'id' in change) {
          nextSelectedId = change.selected ? change.id : null;
        }
      }

      setSelectedNodeId(nextSelectedId ?? null);

      const previousNodes = flowNodesRef.current;
      const applied = applyNodeChanges(changes, previousNodes) as FlowNode[];
      const withSelection = applied.map((node) => ({
        ...node,
        selected: node.id === (nextSelectedId ?? null),
      }));
      flowNodesRef.current = withSelection;
      setFlowNodes(withSelection);

      for (const change of changes) {
        if (change.type === 'position' && (change.dragging === false || change.dragging === undefined) && 'id' in change) {
          const moved = applied.find((node) => node.id === change.id);
          if (!moved) continue;
          const { x, y } = moved.position ?? { x: 0, y: 0 };
          updateNode(change.id, { x, y });
        }
      }
    },
    [updateNode],
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof applyEdgeChanges>[0]) => {
      const current = flowEdgesRef.current;
      const applied = applyEdgeChanges(changes, current);
      flowEdgesRef.current = applied;
      setFlowEdges(applied);
      const shouldPersist = changes.some((change) =>
        change.type === 'remove' || change.type === 'add' || change.type === 'replace',
      );
      if (!shouldPersist) {
        return;
      }
      const nextPersisted = applied.map(fromFlowEdge);
      setEdges(nextPersisted);
    },
    [setEdges],
  );

  const handleConnect = useCallback(
    (connection: Parameters<typeof addEdge>[0]) => {
      if (!connection?.source || !connection?.target) {
        return;
      }
      const current = flowEdgesRef.current;
      const edgeId = buildEdgeId(
        connection.source,
        connection.sourceHandle ?? null,
        connection.target,
        connection.targetHandle ?? null,
      );
      if (current.some((edge) => edge.id === edgeId)) {
        return;
      }
      const nextEdges = addEdge({ ...connection, id: edgeId }, current);
      flowEdgesRef.current = nextEdges;
      setFlowEdges(nextEdges);
      const persisted = nextEdges.map(fromFlowEdge);
      setEdges(persisted);
    },
    [setEdges],
  );

  const sidebarStatus: GraphNodeStatus = useMemo(() => {
    const fromApi = mapProvisionState(statusQuery.data);
    if (fromApi) {
      return fromApi;
    }
    if (selectedNode?.status) {
      return selectedNode.status;
    }
    return 'not_ready';
  }, [selectedNode?.status, statusQuery.data]);

  const sidebarConfig = useMemo(() => {
    if (!selectedNode) {
      return null;
    }
    const baseConfig = selectedNode.config ?? {};
    return {
      kind: selectedNode.kind,
      title: selectedNode.title,
      ...baseConfig,
    } satisfies SidebarNodeConfig;
  }, [selectedNode]);

  const handleConfigChange = useCallback(
    (nextConfig: Partial<SidebarNodeConfig>) => {
      const nodeId = selectedNodeIdRef.current;
      if (!nodeId) return;
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) return;

      const updatedConfig: Record<string, unknown> = {
        kind: node.kind,
        title: node.title,
        ...(node.config ?? {}),
        ...nextConfig,
      };

      const nextTitle = typeof updatedConfig.title === 'string' ? updatedConfig.title : node.title;
      updatedConfig.kind = node.kind;
      updatedConfig.title = nextTitle;

      updateNode(nodeId, {
        config: updatedConfig,
        ...(nextTitle !== node.title ? { title: nextTitle } : {}),
      });
    },
    [nodes, updateNode],
  );

  if (loading && nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading graph...
      </div>
    );
  }

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
      {selectedNode && sidebarConfig ? (
        <NodePropertiesSidebar
          config={sidebarConfig}
          state={{ status: sidebarStatus }}
          onConfigChange={handleConfigChange}
        />
      ) : (
        <EmptySelectionSidebar />
      )}
    </div>
  );
}
