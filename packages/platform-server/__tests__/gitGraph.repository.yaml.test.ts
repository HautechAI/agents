import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { GitGraphRepository } from '../src/graph/gitGraph.repository';
import { LoggerService } from '../src/core/services/logger.service';
import type { TemplateRegistry } from '../src/graph-core/templateRegistry';
import type { ConfigService } from '../src/core/services/config.service';

const schema = [
  { name: 'trigger', title: 'Trigger', kind: 'trigger', sourcePorts: ['out'], targetPorts: [] },
  { name: 'agent', title: 'Agent', kind: 'agent', sourcePorts: [], targetPorts: ['in'] },
] as const;

const logger = new LoggerService();

const defaultGraph = {
  name: 'main',
  version: 0,
  nodes: [
    { id: 'trigger', template: 'trigger', position: { x: 0, y: 0 } },
    { id: 'agent', template: 'agent', position: { x: 1, y: 1 } },
  ],
  edges: [
    { source: 'trigger', sourceHandle: 'out', target: 'agent', targetHandle: 'in' },
  ],
  variables: [{ key: 'env', value: 'prod' }],
};

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function createTemplateRegistry(): TemplateRegistry {
  return {
    toSchema: vi.fn().mockResolvedValue(schema),
  } as unknown as TemplateRegistry;
}

function createConfig(
  graphRepoPath: string,
  overrides?: Partial<Pick<ConfigService, 'graphStoreWriteJson' | 'graphAutoConvertJson' | 'graphBranch'>>,
): ConfigService {
  const base = {
    graphRepoPath,
    graphBranch: overrides?.graphBranch ?? 'graph-state',
    graphAuthorName: 'Casey Quinn',
    graphAuthorEmail: 'casey@example.com',
    graphLockTimeoutMs: 1000,
    graphStoreWriteJson: overrides?.graphStoreWriteJson ?? false,
    graphAutoConvertJson: overrides?.graphAutoConvertJson ?? false,
  } as const;
  return base as unknown as ConfigService;
}

describe('GitGraphRepository YAML storage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-yaml-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('writes YAML files by default', async () => {
    const repo = new GitGraphRepository(createConfig(tempDir), logger, createTemplateRegistry());

    await repo.initIfNeeded();
    await repo.upsert(defaultGraph, undefined);

    const metaYaml = path.join(tempDir, 'graph.meta.yaml');
    const metaJson = path.join(tempDir, 'graph.meta.json');
    const nodeYaml = path.join(tempDir, 'nodes', 'trigger.yaml');
    const nodeJson = path.join(tempDir, 'nodes', 'trigger.json');
    const edgeYaml = path.join(tempDir, 'edges', `${encodeURIComponent('trigger-out__agent-in')}.yaml`);
    const edgeJson = path.join(tempDir, 'edges', `${encodeURIComponent('trigger-out__agent-in')}.json`);
    const varsYaml = path.join(tempDir, 'variables.yaml');
    const varsJson = path.join(tempDir, 'variables.json');

    expect(await pathExists(metaYaml)).toBe(true);
    expect(await pathExists(metaJson)).toBe(false);
    expect(await pathExists(nodeYaml)).toBe(true);
    expect(await pathExists(nodeJson)).toBe(false);
    expect(await pathExists(edgeYaml)).toBe(true);
    expect(await pathExists(edgeJson)).toBe(false);
    expect(await pathExists(varsYaml)).toBe(true);
    expect(await pathExists(varsJson)).toBe(false);

    const stored = await repo.get('main');
    expect(stored?.nodes).toHaveLength(2);
    expect(stored?.edges).toHaveLength(1);
    expect(stored?.variables?.[0]).toEqual({ key: 'env', value: 'prod' });
  });

  it('writes JSON alongside YAML when enabled', async () => {
    const repo = new GitGraphRepository(
      createConfig(tempDir, { graphStoreWriteJson: true }),
      logger,
      createTemplateRegistry(),
    );

    await repo.initIfNeeded();
    await repo.upsert(defaultGraph, undefined);

    expect(await pathExists(path.join(tempDir, 'graph.meta.yaml'))).toBe(true);
    expect(await pathExists(path.join(tempDir, 'graph.meta.json'))).toBe(true);
    expect(await pathExists(path.join(tempDir, 'nodes', 'trigger.yaml'))).toBe(true);
    expect(await pathExists(path.join(tempDir, 'nodes', 'trigger.json'))).toBe(true);
    expect(await pathExists(path.join(tempDir, 'variables.yaml'))).toBe(true);
    expect(await pathExists(path.join(tempDir, 'variables.json'))).toBe(true);
  });

  it('falls back to JSON when YAML missing and auto-converts when enabled', async () => {
    const templateRegistry = createTemplateRegistry();
    const config = createConfig(tempDir, { graphStoreWriteJson: true });
    const repo = new GitGraphRepository(config, logger, templateRegistry);

    await repo.initIfNeeded();
    await repo.upsert(defaultGraph, undefined);

    // Remove YAML files to emulate legacy JSON-only state
    await fs.unlink(path.join(tempDir, 'graph.meta.yaml'));
    await fs.unlink(path.join(tempDir, 'nodes', 'trigger.yaml'));
    await fs.unlink(path.join(tempDir, 'edges', `${encodeURIComponent('trigger-out__agent-in')}.yaml`));
    await fs.unlink(path.join(tempDir, 'variables.yaml'));

    const autoConfig = createConfig(tempDir, {
      graphStoreWriteJson: false,
      graphAutoConvertJson: true,
    });
    const repoWithAuto = new GitGraphRepository(autoConfig, logger, createTemplateRegistry());
    await repoWithAuto.initIfNeeded();
    const stored = await repoWithAuto.get('main');
    expect(stored?.nodes).toHaveLength(2);
    expect(await pathExists(path.join(tempDir, 'graph.meta.yaml'))).toBe(true);
    expect(await pathExists(path.join(tempDir, 'nodes', 'trigger.yaml'))).toBe(true);
    expect(await pathExists(path.join(tempDir, 'edges', `${encodeURIComponent('trigger-out__agent-in')}.yaml`))).toBe(
      true,
    );
    expect(await pathExists(path.join(tempDir, 'variables.yaml'))).toBe(true);
  });
});
