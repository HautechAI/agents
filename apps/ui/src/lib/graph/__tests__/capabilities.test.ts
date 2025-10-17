import { describe, it, expect } from 'vitest';
import { hasStaticConfig, hasStaticConfigByName } from '../../graph/capabilities';

const a = { name: 'a', title: 'A', kind: 'tool', sourcePorts: {}, targetPorts: {}, staticConfigSchema: {} } as any;
const b = { name: 'b', title: 'B', kind: 'tool', sourcePorts: {}, targetPorts: {}, staticConfigSchema: undefined } as any;

describe('capabilities helpers (lifecycle-only)', () => {
  it('hasStaticConfig returns true when schema present', () => {
    expect(hasStaticConfig(a)).toBe(true);
    expect(hasStaticConfig(b)).toBe(false);
  });
  it('hasStaticConfigByName via resolver', () => {
    const map = new Map([['a', a]]);
    const get = (n: string) => map.get(n);
    expect(hasStaticConfigByName('a', get)).toBe(true);
    expect(hasStaticConfigByName('z', get)).toBe(false);
  });
});
