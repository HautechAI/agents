import { LoggerService } from '../../src/core/services/logger.service';
import { LocalMCPServerNode } from '../../src/graph/nodes/mcp/localMcpServer.node';
import { NodeStateService } from '../../src/graph/nodeState.service';
import { ContainerService } from '../../src/infra/container/container.service';
import { VaultService } from '../../src/vault/vault.service';
import { EnvService } from '../../src/env/env.service';
import { ConfigService } from '../../src/core/services/config.service';

// Narrow test-facing stub interface to avoid leaking product types into tests
export interface NodeStateServiceStub {
  getSnapshot: (nodeId: string) => { mcp?: { enabledTools?: string[] } } | undefined;
}

// Create lightweight instances with the right prototype to satisfy class types
// without depending on constructors or DI. Methods are attached only if/when used.
function createClassLikeInstance<T>(proto: object): T {
  return Object.create(proto) as T;
}

/**
 * Factory to construct LocalMCPServerNode for tests with safe, typed placeholders.
 * Avoids any/double assertions by using prototype-based instances and structural methods.
 */
export function createTestLocalMcpServerNode(opts?: { nodeStateService?: NodeStateServiceStub }): LocalMCPServerNode {
  const logger = new LoggerService();

  // Unused deps in these tests; provide prototype-backed instances.
  const containerSvc = createClassLikeInstance<ContainerService>(ContainerService.prototype);
  const vaultSvc = createClassLikeInstance<VaultService>(VaultService.prototype);
  const envSvc = createClassLikeInstance<EnvService>(EnvService.prototype);
  const configSvc = createClassLikeInstance<ConfigService>(ConfigService.prototype);

  // Build a NodeStateService-like object with just the method we exercise in tests.
  const nodeStateSvc: NodeStateService | undefined = opts?.nodeStateService
    ? (() => {
        const inst = createClassLikeInstance<NodeStateService>(NodeStateService.prototype);
        // Attach only the public methods accessed by LocalMCPServerNode in these tests.
        // getSnapshot is used for listTools filtering; upsertNodeState is never called in these tests.
        inst.getSnapshot = opts.nodeStateService.getSnapshot as NodeStateService['getSnapshot'];
        return inst;
      })()
    : undefined;

  return new LocalMCPServerNode(containerSvc, logger, vaultSvc, envSvc, configSvc, nodeStateSvc);
}
