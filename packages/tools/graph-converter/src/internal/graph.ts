import YAML from 'yaml';
import type { GraphEdge, GraphNode, GraphDataset, NormalizedGraph } from './types.js';

export function deterministicEdgeId(edge: Pick<GraphEdge, 'source' | 'sourceHandle' | 'target' | 'targetHandle'>): string {
  return `${edge.source}-${edge.sourceHandle}__${edge.target}-${edge.targetHandle}`;
}

export function normalizeDataset(dataset: GraphDataset): NormalizedGraph {
  if (!dataset.meta) {
    throw new Error('Missing graph.meta.json in dataset');
  }

  const nodes = dataset.nodes.map((node) => ({ ...node }));
  const edges = dataset.edges.map((edge) => ({ ...edge, id: deterministicEdgeId(edge) }));

  assertEdgeReferences(nodes, edges);

  return {
    meta: dataset.meta,
    nodes,
    edges,
    variables: dataset.variables,
  };
}

export function assertEdgeReferences(nodes: GraphNode[], edges: GraphEdge[]): void {
  const knownIds = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    if (!knownIds.has(edge.source)) {
      throw new Error(`Missing node referenced by edge ${edge.id}: ${edge.source}`);
    }
    if (!knownIds.has(edge.target)) {
      throw new Error(`Missing node referenced by edge ${edge.id}: ${edge.target}`);
    }
  }
}

export function serializeYaml(value: unknown): string {
  return YAML.stringify(value, { indent: 2, lineWidth: 0, sortMapEntries: false });
}
