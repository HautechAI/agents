import { describe, it, expect } from 'vitest';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { buildTemplateRegistry } from '../src/templates';
import type { LoggerService } from '../src/services/logger.service';
import type { ContainerService } from '../src/services/container.service';
import type { ConfigService } from '../src/services/config.service';
import type { CheckpointerService } from '../src/services/checkpointer.service';
import type { MongoService } from '../src/services/mongo.service';

function makeRuntime() {
  const logger: LoggerService = { info: () => {}, debug: () => {}, error: () => {} } as any;
  const deps = {
    logger,
    containerService: {} as unknown as ContainerService,
    configService: {} as unknown as ConfigService,
    checkpointerService: {} as unknown as CheckpointerService,
    mongoService: { getDb: () => ({} as any) } as unknown as MongoService,
  };
  const registry = buildTemplateRegistry(deps);
  const runtime = new LiveGraphRuntime(logger, registry);
  return { registry, runtime };
}

describe('containerProvider nix config acceptance', () => {
  it('applies config with nix.packages without CONFIG_APPLY_ERROR and preserves nix in live config', async () => {
    const { runtime } = makeRuntime();
    const graph = {
      nodes: [
        {
          id: 'ws',
          data: {
            template: 'containerProvider',
            config: {
              image: 'alpine:3',
              nix: { packages: [{ attr: 'htop', pname: 'htop', channel: 'nixpkgs' }] },
            },
          },
        },
      ],
      edges: [],
    } as any;
    const res = await runtime.apply(graph);
    expect(res.errors.length).toBe(0);
    const live = runtime.getNodes().find((n) => n.id === 'ws');
    expect(live?.config && (live.config as any).nix?.packages?.length).toBe(1);
    expect((live?.config as any).nix.packages[0]).toEqual({ attr: 'htop', pname: 'htop', channel: 'nixpkgs' });
  });

  it('defaults nix.packages to [] when nix present without packages and strips unknown top-level keys', async () => {
    const { runtime } = makeRuntime();
    const graph = {
      nodes: [
        {
          id: 'ws2',
          data: {
            template: 'containerProvider',
            config: {
              image: 'alpine:3',
              nix: {},
              bogusTopLevelKey: 'should_be_stripped',
            },
          },
        },
      ],
      edges: [],
    } as any;
    const res = await runtime.apply(graph);
    expect(res.errors.length).toBe(0);
    const live = runtime.getNodes().find((n) => n.id === 'ws2');
    expect((live?.config as any).nix).toBeTruthy();
    expect((live?.config as any).nix.packages).toEqual([]);
    expect((live?.config as any).bogusTopLevelKey).toBeUndefined();
  });
});

