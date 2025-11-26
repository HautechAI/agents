import { serializeYaml } from '../../src/internal/graph.js';

describe('serializeYaml', () => {
  it('uses two-space indentation and preserves key order', () => {
    const value = { b: 2, a: { nested: true } };
    const output = serializeYaml(value);
    const lines = output.trim().split('\n');
    expect(lines[0]).toBe('b: 2');
    expect(lines[1]).toBe('a:');
    expect(lines[2]).toBe('  nested: true');
  });
});
