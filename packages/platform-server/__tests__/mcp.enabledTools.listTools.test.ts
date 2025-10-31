import { describe, it, expect } from 'vitest';
import { createTestLocalMcpServerNode, type NodeStateServiceStub } from './helpers/mcpTestUtils';

describe('LocalMCPServerNode listTools enabledTools filtering', () => {
  function createServer(opts: { nodeStateService?: NodeStateServiceStub; namespace?: string }) {
    const server = createTestLocalMcpServerNode({ nodeStateService: opts.nodeStateService });
    return server;
  }

  it('respects _lastEnabledTools when snapshot unavailable (boot-time)', async () => {
    const server = createServer({ namespace: 'ns' });
    await server.setConfig({ namespace: 'ns' });
    // Preload two tools
    server.preloadCachedTools([{ name: 'toolA' }, { name: 'toolB' }], Date.now());
    // Simulate state update setting enabledTools while snapshot may be unavailable
    await server.setState({ mcp: { enabledTools: ['toolA'] } });
    const listed = server.listTools();
    // Should include only namespaced toolA
    expect(listed.map((t) => t.name)).toEqual(['ns_toolA']);
  });

  it('matches both raw and namespaced names from enabledTools', async () => {
    // Mock NodeStateService snapshot
    const nodeStateService: NodeStateServiceStub = {
      getSnapshot: (_nodeId: string) => ({ mcp: { enabledTools: ['toolA', 'ns_toolB'] } }),
    };
    const server = createServer({ nodeStateService, namespace: 'ns' });
    // NodeId required when accessing snapshot
    server.init({ nodeId: 'node-1' });
    await server.setConfig({ namespace: 'ns' });
    server.preloadCachedTools([{ name: 'toolA' }, { name: 'toolB' }, { name: 'toolC' }], Date.now());
    const listed = server.listTools();
    // Should include ns_toolA (raw match) and ns_toolB (namespaced match), exclude ns_toolC
    expect(listed.map((t) => t.name).sort()).toEqual(['ns_toolA', 'ns_toolB']);
  });

  it('handles enabledTools undefined (all tools) and empty array (no tools)', async () => {
    const serverAll = createServer({ namespace: 'ns' });
    await serverAll.setConfig({ namespace: 'ns' });
    serverAll.preloadCachedTools([{ name: 'toolA' }, { name: 'toolB' }], Date.now());
    // No snapshot and no lastEnabledTools => undefined => all tools
    const allListed = serverAll.listTools();
    expect(allListed.map((t) => t.name).sort()).toEqual(['ns_toolA', 'ns_toolB']);

    // With snapshot providing empty enabledTools => filter to none
    const nodeStateServiceEmpty: NodeStateServiceStub = { getSnapshot: (_id: string) => ({ mcp: { enabledTools: [] } }) };
    const serverNone = createServer({ nodeStateService: nodeStateServiceEmpty, namespace: 'ns' });
    serverNone.init({ nodeId: 'node-2' });
    await serverNone.setConfig({ namespace: 'ns' });
    serverNone.preloadCachedTools([{ name: 'toolA' }, { name: 'toolB' }], Date.now());
    const noneListed = serverNone.listTools();
    expect(noneListed.length).toBe(0);
  });

  it('falls back to _lastEnabledTools when snapshot throws', async () => {
    const throwingStateService: NodeStateServiceStub = { getSnapshot: (_id: string) => { throw new Error('snapshot error'); } };
    const server = createServer({ nodeStateService: throwingStateService, namespace: 'ns' });
    server.init({ nodeId: 'node-3' });
    await server.setConfig({ namespace: 'ns' });
    server.preloadCachedTools([{ name: 'toolA' }, { name: 'toolB' }], Date.now());
    // Seed lastEnabled via setState
    await server.setState({ mcp: { enabledTools: ['toolB'] } });
    const listed = server.listTools();
    expect(listed.map((t) => t.name)).toEqual(['ns_toolB']);
  });

  it('does not match namespaced enabled entries when namespace is empty', async () => {
    const nodeStateService: NodeStateServiceStub = { getSnapshot: (_id: string) => ({ mcp: { enabledTools: ['ns_toolA', 'toolB'] } }) };
    const server = createServer({ nodeStateService, namespace: '' });
    server.init({ nodeId: 'node-4' });
    await server.setConfig({ namespace: '' });
    server.preloadCachedTools([{ name: 'toolA' }, { name: 'toolB' }], Date.now());
    const listed = server.listTools();
    // Only raw toolB should match; ns_toolA should not match when server has no namespace
    expect(listed.map((t) => t.name).sort()).toEqual(['toolB']);
  });

  it('ignores other namespace entries and supports raw matches', async () => {
    const nodeStateService: NodeStateServiceStub = { getSnapshot: (_id: string) => ({ mcp: { enabledTools: ['other_toolB', 'toolB'] } }) };
    const server = createServer({ nodeStateService, namespace: 'ns' });
    server.init({ nodeId: 'node-5' });
    await server.setConfig({ namespace: 'ns' });
    server.preloadCachedTools([{ name: 'toolA' }, { name: 'toolB' }], Date.now());
    const listed = server.listTools();
    expect(listed.map((t) => t.name).sort()).toEqual(['ns_toolB']);
  });

  it('returns [] when cache is empty regardless of enabledTools', async () => {
    const nodeStateService: NodeStateServiceStub = { getSnapshot: (_id: string) => ({ mcp: { enabledTools: ['toolA'] } }) };
    const server = createServer({ nodeStateService, namespace: 'ns' });
    server.init({ nodeId: 'node-6' });
    await server.setConfig({ namespace: 'ns' });
    // No preload -> empty cache
    const listed = server.listTools();
    expect(listed.length).toBe(0);
  });

  it('handles duplicates in enabledTools without duplicating results', async () => {
    const nodeStateService: NodeStateServiceStub = {
      getSnapshot: (_id: string) => ({ mcp: { enabledTools: ['toolA', 'ns_toolA', 'toolA'] } }),
    };
    const server = createServer({ nodeStateService, namespace: 'ns' });
    server.init({ nodeId: 'node-7' });
    await server.setConfig({ namespace: 'ns' });
    server.preloadCachedTools([{ name: 'toolA' }, { name: 'toolB' }], Date.now());
    const listed = server.listTools();
    expect(listed.map((t) => t.name)).toEqual(['ns_toolA']);
  });
});
