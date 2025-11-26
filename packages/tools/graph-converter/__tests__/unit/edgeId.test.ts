import { deterministicEdgeId, normalizeDataset } from '../../src/internal/graph.js';
import type { GraphDataset } from '../../src/internal/types.js';

describe('deterministicEdgeId', () => {
  it('builds the expected id', () => {
    const id = deterministicEdgeId({
      source: 'node-a',
      sourceHandle: 'out',
      target: 'node-b',
      targetHandle: 'in',
    });
    expect(id).toBe('node-a-out__node-b-in');
  });

  it('normalizes edges inside normalizeDataset', () => {
    const dataset: GraphDataset = {
      meta: {
        name: 'main',
        version: 1,
        updatedAt: new Date().toISOString(),
        format: 2,
      },
      nodes: [
        { id: 'node-a', template: 'template-a' },
        { id: 'node-b', template: 'template-b' },
      ],
      edges: [
        {
          source: 'node-a',
          sourceHandle: 'out',
          target: 'node-b',
          targetHandle: 'in',
        },
      ],
      variables: [],
    };

    const normalized = normalizeDataset(dataset);
    expect(normalized.edges[0].id).toBe('node-a-out__node-b-in');
  });
});
