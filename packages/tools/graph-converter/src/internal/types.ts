export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface GraphMeta {
  name: string;
  version: number;
  updatedAt: string;
  format: 2;
}

export interface GraphNode {
  id: string;
  template: string;
  config?: JsonValue;
  state?: JsonValue;
  position?: {
    x: number;
    y: number;
  };
}

export interface GraphEdgeInput {
  id?: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface GraphEdge extends GraphEdgeInput {
  id: string;
}

export interface GraphVariable {
  key: string;
  value: string;
}

export type GraphFileKind = 'meta' | 'node' | 'edge' | 'variables';

export interface GraphDataset {
  meta: GraphMeta | null;
  nodes: GraphNode[];
  edges: GraphEdgeInput[];
  variables: GraphVariable[];
}

export interface NormalizedGraph extends GraphDataset {
  meta: GraphMeta;
  edges: GraphEdge[];
}
