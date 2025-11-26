import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Logger } from '../src/log.js';

export async function createTempDir(): Promise<string> {
  const dir = path.join(tmpdir(), `graph-converter-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export const noopLogger: Logger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
};

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8');
}
