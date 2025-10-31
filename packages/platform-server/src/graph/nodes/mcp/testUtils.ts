import { LoggerService } from '../../../core/services/logger.service';
import { LocalMCPServerNode } from './localMcpServer.node';
import type { NodeStateService } from '../../../graph/nodeState.service';
import type { ContainerService } from '../../../infra/container/container.service';
import type { VaultService } from '../../../vault/vault.service';
import type { EnvService } from '../../../env/env.service';
import type { ConfigService } from '../../../core/services/config.service';

// Typed stub interfaces used for tests to avoid `any`
export interface NodeStateServiceStub {
  getSnapshot: (nodeId: string) => { mcp?: { enabledTools?: string[] } } | undefined;
}

/**
 * Factory to construct LocalMCPServerNode for tests with sensible no-op defaults.
 * Avoids `any` in tests by centralizing minimal type assertions here.
 */
export function createTestLocalMcpServerNode(opts?: { nodeStateService?: NodeStateServiceStub }): LocalMCPServerNode {
  const logger = new LoggerService();
  // Unused deps: safe no-op placeholders asserted to their types internally
  const containerSvc = undefined as unknown as ContainerService;
  const vaultSvc = undefined as unknown as VaultService;
  const envSvc = undefined as unknown as EnvService;
  const configSvc = undefined as unknown as ConfigService;
  const nodeStateSvc = (opts?.nodeStateService || undefined) as unknown as NodeStateService;
  return new LocalMCPServerNode(containerSvc, logger, vaultSvc, envSvc, configSvc, nodeStateSvc);
}

