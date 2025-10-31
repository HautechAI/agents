import { describe, it, expect } from 'vitest';
import { LocalMCPServerNode } from '../src/graph/nodes/mcp/localMcpServer.node';
import { LoggerService } from '../src/core/services/logger.service.js';

describe('LocalMCPServerNode listTools enabledTools filtering', () => {
  const logger = new LoggerService();

  function createServer(opts: { nodeStateService?: any; namespace?: string }) {
    const server = new LocalMCPServerNode(
      {} as any,
      logger as any,
      undefined as any,
      undefined as any,
      undefined as any,
      opts.nodeStateService as any,
    );
    // Set a namespace for namespacing behavior
    return server;
  }

  it('respects _lastEnabledTools when snapshot unavailable (boot-time)', async () => {
    const server = createServer({ namespace: 'ns' });
    await server.setConfig({ namespace: 'ns' } as any);
    // Preload two tools
    (server as any).preloadCachedTools([{ name: 'toolA' }, { name: 'toolB' }], Date.now());
    // Simulate state update setting enabledTools while snapshot may be unavailable
    await server.setState({ mcp: { enabledTools: ['toolA'] } } as any);
    const listed = server.listTools();
    // Should include only namespaced toolA
    expect(listed.map((t) => t.name)).toEqual(['ns_toolA']);
  });

  it('matches both raw and namespaced names from enabledTools', async () => {
    // Mock NodeStateService snapshot
    const nodeStateService = {
      getSnapshot: (_nodeId: string) => ({ mcp: { enabledTools: ['toolA', 'ns_toolB'] } }),
    };
    const server = createServer({ nodeStateService, namespace: 'ns' });
    // NodeId required when accessing snapshot
    (server as any).init({ nodeId: 'node-1' });
    await server.setConfig({ namespace: 'ns' } as any);
    (server as any).preloadCachedTools([{ name: 'toolA' }, { name: 'toolB' }, { name: 'toolC' }], Date.now());
    const listed = server.listTools();
    // Should include ns_toolA (raw match) and ns_toolB (namespaced match), exclude ns_toolC
    expect(listed.map((t) => t.name).sort()).toEqual(['ns_toolA', 'ns_toolB']);
  });

  it('handles enabledTools undefined (all tools) and empty array (no tools)', async () => {
    const serverAll = createServer({ namespace: 'ns' });
    await serverAll.setConfig({ namespace: 'ns' } as any);
    (serverAll as any).preloadCachedTools([{ name: 'toolA' }, { name: 'toolB' }], Date.now());
    // No snapshot and no lastEnabledTools => undefined => all tools
    const allListed = serverAll.listTools();
    expect(allListed.map((t) => t.name).sort()).toEqual(['ns_toolA', 'ns_toolB']);

    // With snapshot providing empty enabledTools => filter to none
    const nodeStateServiceEmpty = { getSnapshot: (_id: string) => ({ mcp: { enabledTools: [] } }) };
    const serverNone = createServer({ nodeStateService: nodeStateServiceEmpty, namespace: 'ns' });
    (serverNone as any).init({ nodeId: 'node-2' });
    await serverNone.setConfig({ namespace: 'ns' } as any);
    (serverNone as any).preloadCachedTools([{ name: 'toolA' }, { name: 'toolB' }], Date.now());
    const noneListed = serverNone.listTools();
    expect(noneListed.length).toBe(0);
  });
});

