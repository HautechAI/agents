import { useCallback, useMemo, useState } from 'react';
import { addEdge, applyNodeChanges, applyEdgeChanges, type NodeChange, type EdgeChange, type OnConnect, type Connection, type Edge } from 'reactflow';
import { v4 as uuid } from 'uuid';
import { type BuilderNodeKind, DEFAULTS, type BuilderNode, type BuilderNodeData } from '../types';

interface UseBuilderStateResult {
  nodes: BuilderNode[];
  edges: Edge[];
  selectedNode: BuilderNode | null;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: OnConnect;
  addNode: (kind: BuilderNodeKind, position: { x: number; y: number }) => void;
  updateNodeData: (id: string, data: Partial<BuilderNodeData>) => void;
  deleteSelected: () => void;
}

const VALID_MATRIX: Record<string, string[]> = {
  'slack-trigger:trigger': ['agent:triggers'],
  'agent:tools': ['send-slack-message:tool']
};

export function useBuilderState(): UseBuilderStateResult {
  const [nodes, setNodes] = useState<BuilderNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  // future: add fit trigger state if needed

  const selectedNode = useMemo(() => nodes.find(n => n.selected) ?? null, [nodes]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(nds => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges(eds => applyEdgeChanges(changes, eds));
  }, []);

  const isValidConnection = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return false;
    if (connection.source === connection.target) return false;
    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);
    if (!sourceNode || !targetNode) return false;
    const sourceKey = `${sourceNode.type}:${connection.sourceHandle}`;
    const targetKey = `${targetNode.type}:${connection.targetHandle}`;
    return VALID_MATRIX[sourceKey]?.includes(targetKey) ?? false;
  }, [nodes]);

  const onConnect: OnConnect = useCallback((connection) => {
    if (!isValidConnection(connection)) return;
    setEdges(eds => {
      const edgeId = `${connection.source}-${connection.sourceHandle}__${connection.target}-${connection.targetHandle}`;
      if (eds.some(e => e.id === edgeId)) return eds; // prevent duplicates
      return addEdge({ ...connection, id: edgeId }, eds);
    });
  }, [isValidConnection]);

  const addNode = useCallback((kind: BuilderNodeKind, position: { x: number; y: number }) => {
    const id = uuid();
      let baseData: BuilderNodeData;
      switch (kind) {
        case 'slack-trigger':
          baseData = { kind, ...DEFAULTS[kind] } as BuilderNodeData;
          break;
        case 'agent':
          baseData = { kind, ...DEFAULTS[kind] } as BuilderNodeData;
          break;
        case 'send-slack-message':
          baseData = { kind, ...DEFAULTS[kind] } as BuilderNodeData;
          break;
      }
    const node: BuilderNode = {
      id,
      type: kind,
      position,
      data: baseData,
      dragHandle: '.drag-handle'
    };
    setNodes(nds => [...nds, node]);
  }, []);

  const updateNodeData = useCallback((id: string, data: Partial<BuilderNodeData>) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...data } as BuilderNodeData } : n));
  }, []);

  const deleteSelected = useCallback(() => {
    setEdges(eds => eds.filter(e => !nodes.some(n => n.selected && (n.id === e.source || n.id === e.target))));
    setNodes(nds => nds.filter(n => !n.selected));
  }, [nodes]);

  return { nodes, edges, selectedNode, onNodesChange, onEdgesChange, onConnect, addNode, updateNodeData, deleteSelected };
}
