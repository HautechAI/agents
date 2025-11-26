import { promises as fs } from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { GraphFileKind } from './internal/types.js';

export interface GraphFileDescriptor {
  kind: GraphFileKind;
  absolutePath: string;
  relativePath: string;
}

export const DEFAULT_PATTERNS = [
  'graph.meta.json',
  'variables.json',
  'nodes/*.json',
  'edges/*.json',
];

export async function discoverGraphFiles(root: string, patterns: string[]): Promise<GraphFileDescriptor[]> {
  const matches = await fg(patterns, {
    cwd: root,
    absolute: true,
    onlyFiles: true,
    dot: false,
    unique: true,
    followSymbolicLinks: false,
  });

  const descriptors: GraphFileDescriptor[] = [];
  for (const absolutePath of matches) {
    const relativePath = toPosix(path.relative(root, absolutePath));
    const kind = classifyGraphFile(relativePath);
    if (kind) {
      descriptors.push({ kind, absolutePath, relativePath });
    }
  }
  return descriptors;
}

export async function readJsonFile(absolutePath: string): Promise<unknown> {
  const raw = await fs.readFile(absolutePath, 'utf8');
  return JSON.parse(raw) as unknown;
}

export function deriveNodeIdFromPath(relativePath: string): string {
  const base = path.basename(relativePath, path.extname(relativePath));
  return decodeURIComponent(base);
}

export async function writeYamlFile(absolutePath: string, content: string, atomic: boolean): Promise<void> {
  if (!atomic) {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, 'utf8');
    return;
  }
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  const tempName = `.${path.basename(absolutePath)}.${process.pid}.${Date.now()}.tmp`;
  const tempPath = path.join(path.dirname(absolutePath), tempName);
  const handle = await fs.open(tempPath, 'w');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tempPath, absolutePath);
  const dirHandle = await fs.open(path.dirname(absolutePath), 'r');
  try {
    await dirHandle.sync();
  } finally {
    await dirHandle.close();
  }
}

export async function backupOriginal(jsonPath: string, backupExt: string): Promise<string> {
  const ext = backupExt.startsWith('.') ? backupExt : `.${backupExt}`;
  const backupPath = `${jsonPath}${ext}`;
  await fs.rm(backupPath, { force: true });
  await fs.rename(jsonPath, backupPath);
  return backupPath;
}

function classifyGraphFile(relativePath: string): GraphFileKind | null {
  if (relativePath === 'graph.meta.json') return 'meta';
  if (relativePath === 'variables.json') return 'variables';
  if (relativePath.startsWith('nodes/') && relativePath.endsWith('.json')) return 'node';
  if (relativePath.startsWith('edges/') && relativePath.endsWith('.json')) return 'edge';
  return null;
}

function toPosix(input: string): string {
  return input.split(path.sep).join('/');
}
