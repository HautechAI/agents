import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock httpJson client used by modules (use vi.hoisted to avoid TDZ issues)
const hoisted = vi.hoisted(() => ({ httpJson: vi.fn() }));
vi.mock('@/api/client', () => ({ httpJson: hoisted.httpJson }));

import { graph as api } from '@/api/modules/graph';

describe('graph api client', () => {
  beforeEach(() => {
    hoisted.httpJson.mockReset();
    hoisted.httpJson.mockImplementation(async (url: string, _init?: any) => {
      if (url === '/api/graph/templates') return [{ name: 'x', title: 'X', kind: 'tool', sourcePorts: {}, targetPorts: {} }];
      if (String(url).includes('/status')) return { isPaused: false };
      if (String(url).includes('/dynamic-config/schema')) return {};
      if (String(url).includes('/actions') && _init?.method === 'POST') return undefined;
      return {} as any;
    });
  });

  it('getTemplates', async () => {
    const t = await api.getTemplates();
    expect(t[0].name).toBe('x');
  });
  it('getNodeStatus', async () => {
    const s = await api.getNodeStatus('n1');
    expect(s.isPaused).toBe(false);
  });

  it('getDynamicConfigSchema returns null for wrapper/empty', async () => {
    // wrapper response
    hoisted.httpJson.mockImplementationOnce(async () => ({ ready: false }));
    const r1 = await api.getDynamicConfigSchema('n1');
    expect(r1).toBeNull();

    // empty object
    hoisted.httpJson.mockImplementationOnce(async () => ({}));
    const r2 = await api.getDynamicConfigSchema('n1');
    expect(r2).toBeNull();
  });

  it('getDynamicConfigSchema returns schema when valid', async () => {
    const schema = { type: 'object', properties: { a: { type: 'string' } } };
    hoisted.httpJson.mockImplementationOnce(async () => schema);
    const r = await api.getDynamicConfigSchema('n1');
    expect(r).toEqual(schema);

    // wrapped
    hoisted.httpJson.mockImplementationOnce(async () => ({ ready: true, schema }));
    const r2 = await api.getDynamicConfigSchema('n1');
    expect(r2).toEqual(schema);
  });
});
