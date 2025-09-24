import { describe, it, expect } from 'vitest';
import { LoggerService } from '../services/logger.service';
import { MemoryService, NotImplementedError } from '../services/memory.service';

// Create a minimal mock Db just to satisfy types; we won't call it since methods throw
const mockDb: any = {};
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
    expect(svc._normalizePath('/a//b/ c ')).toBe('a.b.c');
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

describe('MemoryService methods placeholders', () => {
  const svc = createGlobalService();
  it('read throws NotImplemented', async () => {
    await expect(svc.read('/a')).rejects.toBeInstanceOf(NotImplementedError);
  });
  it('list throws NotImplemented', async () => {
    await expect(svc.list('/a')).rejects.toBeInstanceOf(NotImplementedError);
  });
  it('append throws NotImplemented', async () => {
    await expect(svc.append('/a', {})).rejects.toBeInstanceOf(NotImplementedError);
  });
  it('update throws NotImplemented', async () => {
    await expect(svc.update('/a', {}, {})).rejects.toBeInstanceOf(NotImplementedError);
  });
  it('delete throws NotImplemented', async () => {
    await expect(svc.delete('/a')).rejects.toBeInstanceOf(NotImplementedError);
  });
  it('stat throws NotImplemented', async () => {
    await expect(svc.stat('/a')).rejects.toBeInstanceOf(NotImplementedError);
  });
  it('ensureDir throws NotImplemented', async () => {
    await expect(svc.ensureDir('/a')).rejects.toBeInstanceOf(NotImplementedError);
  });
});
