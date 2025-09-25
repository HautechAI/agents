import { describe, it, expect } from 'vitest';
import { LoggerService } from '../src/services/logger.service';
import { MemoryService } from '../src/services/memory.service';

// Minimal mock Db with collection methods used by MemoryService
const mockDb: any = {
  collection: () => ({ createIndex: async () => {}, findOne: async () => null, updateOne: async () => ({}) }),
};
const logger = new LoggerService();

function createGlobalService() {
  return new MemoryService(mockDb, logger, {
    nodeId: 'node-1',
    scope: 'global',
    threadResolver: () => undefined,
  });
}

function createThreadService(tid?: string) {
  return new MemoryService(mockDb, logger, {
    nodeId: 'node-1',
    scope: 'perThread',
    threadResolver: () => tid,
  });
}

describe('MemoryService helpers', () => {
  it('normalizePath trims and joins with dots', () => {
    const svc = createGlobalService();
    expect(svc._normalizePath('/a/b/c')).toBe('a.b.c');
    expect(() => svc._normalizePath('/a//b/ c ')).toThrow();
  });

  it('normalizePath validates leading / and rejects ..', () => {
    const svc = createGlobalService();
    expect(() => svc._normalizePath('a/b')).toThrow();
    expect(() => svc._normalizePath('/a/../b')).toThrow();
  });

  it('ensureDocKey returns global key when scope is global', () => {
    const svc = createGlobalService();
    expect(svc._ensureDocKey()).toEqual({ nodeId: 'node-1', scope: 'global' });
  });

  it('ensureDocKey includes threadId when perThread', () => {
    const svc = createThreadService('t-1');
    expect(svc._ensureDocKey()).toEqual({ nodeId: 'node-1', scope: 'perThread', threadId: 't-1' });
  });

  it('ensureDocKey throws when perThread but no threadId', () => {
    const svc = createThreadService(undefined);
    expect(() => svc._ensureDocKey()).toThrow();
  });
});

describe('MemoryService methods implemented', () => {
  it('stat returns missing for empty DB (no throw)', async () => {
    const svc = createGlobalService();
    await expect(svc.stat('/a')).resolves.toEqual({ exists: false, kind: 'missing' });
  });
});
