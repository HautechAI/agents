import { assertEdgeReferences } from '../../src/internal/graph.js';

describe('assertEdgeReferences', () => {
  it('throws when an edge references a missing node', () => {
    expect(() =>
      assertEdgeReferences(
        [{ id: 'node-a', template: 'template' }],
        [
          {
            id: 'node-a-out__node-b-in',
            source: 'node-a',
            sourceHandle: 'out',
            target: 'node-b',
            targetHandle: 'in',
          },
        ],
      ),
    ).toThrow(/node-b/);
  });
});
