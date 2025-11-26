import { deriveNodeIdFromPath } from '../../src/fs.js';

describe('deriveNodeIdFromPath', () => {
  it('decodes URL-encoded ids from path', () => {
    expect(deriveNodeIdFromPath('nodes/simple-node.json')).toBe('simple-node');
    expect(deriveNodeIdFromPath('nodes/some%2Fcomplex%20id.json')).toBe('some/complex id');
  });
});
