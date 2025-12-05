import { promises as fs } from 'fs';
import path from 'path';

import { parseYaml, stringifyYaml } from '../src/graph/yaml.util';
import type { PersistedGraphNode } from '../src/shared/types/graph.types';

type BackfillArgs = {
  repoPath: string;
  dryRun: boolean;
};

type ChangeRecord = {
  nodeId: string;
  file: string;
  previousName: string | null;
  nextName: string;
};

const DEFAULT_REPO_PATH = path.resolve(process.cwd(), 'data/graph');

function parseArgs(): BackfillArgs {
  const argv = process.argv.slice(2);
  let repoPath = process.env.GRAPH_REPO_PATH ? path.resolve(process.env.GRAPH_REPO_PATH) : DEFAULT_REPO_PATH;
  let dryRun = true;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo' || arg === '--repo-path') {
      const next = argv[i + 1];
      if (!next) throw new Error('--repo requires a path argument');
      repoPath = path.resolve(next);
      i += 1;
    } else if (arg === '--write') {
      dryRun = false;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  return { repoPath, dryRun };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function collectNodeFiles(repoPath: string): Promise<string[]> {
  const nodesDir = path.join(repoPath, 'nodes');
  try {
    const entries = await fs.readdir(nodesDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.yaml')).map((entry) => path.join(nodesDir, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Graph repository not found at ${nodesDir}. Set GRAPH_REPO_PATH or pass --repo.`);
    }
    throw error;
  }
}

async function backfillAgentNames({ repoPath, dryRun }: BackfillArgs): Promise<ChangeRecord[]> {
  const files = await collectNodeFiles(repoPath);
  const changes: ChangeRecord[] = [];

  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8');
    const node = parseYaml<PersistedGraphNode>(raw);
    if (!node || node.template !== 'agent') continue;

    const config = isPlainRecord(node.config) ? { ...node.config } : ({} as Record<string, unknown>);
    const originalNameRaw = config.name;
    const originalName = trimOrNull(originalNameRaw);

    const normalizedTitle = trimOrNull(config.title);
    const derivedName = originalName ?? normalizedTitle ?? trimOrNull(node.id) ?? `agent-${path.basename(file, '.yaml')}`;

    if (!derivedName) continue;
    if (originalName === derivedName && typeof originalNameRaw === 'string' && originalNameRaw === originalName) {
      continue;
    }

    config.name = derivedName;

    const currentRole = trimOrNull(config.role);
    if (typeof config.role === 'string') {
      if (currentRole) {
        config.role = currentRole;
      } else {
        delete config.role;
      }
    }

    node.config = config;

    const record: ChangeRecord = {
      nodeId: typeof node.id === 'string' && node.id.length > 0 ? node.id : path.basename(file, '.yaml'),
      file,
      previousName: originalName ?? null,
      nextName: derivedName,
    };
    changes.push(record);

    if (!dryRun) {
      const updated = stringifyYaml(node);
      await fs.writeFile(file, updated, 'utf8');
    }
  }

  return changes;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const changes = await backfillAgentNames(args);

  if (changes.length === 0) {
    console.info('No agent nodes required updates.');
    return;
  }

  const header = args.dryRun ? '[dry-run]' : '[applied]';
  for (const change of changes) {
    const fromLabel = change.previousName ?? '(missing)';
    console.info(`${header} ${change.nodeId}: ${fromLabel} -> ${change.nextName} (${change.file})`);
  }
  console.info(`${header} total agent nodes updated: ${changes.length}`);
}

main().catch((error) => {
  console.error('Backfill failed', error);
  process.exitCode = 1;
});
