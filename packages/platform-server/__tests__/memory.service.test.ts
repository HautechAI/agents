import { PrismaClient, Prisma } from '@prisma/client';
import { vi } from 'vitest';
import { PostgresMemoryEntitiesRepository } from '../src/nodes/memory/memory.repository';
import { MemoryService } from '../src/nodes/memory/memory.service';

const URL = process.env.AGENTS_DATABASE_URL;
const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true' && !!URL;
const maybeDescribe = shouldRunDbTests ? describe : describe.skip;

maybeDescribe('MemoryService', () => {
  if (!shouldRunDbTests) return;
  const prisma = new PrismaClient({ datasources: { db: { url: URL! } } });
  const repo = new PostgresMemoryEntitiesRepository({ getClient: () => prisma } as any);
  const graphRepo = { get: vi.fn().mockResolvedValue(null) };
  const svc = new MemoryService(repo, graphRepo as any);

  const clear = async (nodeIds: string[]) => {
    await prisma.$executeRaw`DELETE FROM memory_entities WHERE node_id IN (${Prisma.join(nodeIds)})`;
  };

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('normalizes paths and enforces POSIX rules', async () => {
    expect(svc.normalizePath('a/b')).toBe('/a/b');
    expect(svc.normalizePath('/nested//file.txt')).toBe('/nested/file.txt');
    expect(svc.normalizePath('note.txt')).toBe('/note.txt');
    expect(() => svc.normalizePath('../escape')).toThrow();
    expect(() => svc.normalizePath('/bad$path')).toThrow();
    expect(() => svc.normalizePath('/', { allowRoot: false })).toThrow();
    expect(svc.normalizePath('/', { allowRoot: true })).toBe('/');
  });

  it('performs append/read/update/list/stat/delete with virtual directories', async () => {
    const nodeId = 'memory-service-n1';
    await clear([nodeId]);
    const bound = svc.forMemory(nodeId, 'global');

    await bound.append('/notes/today', 'hello');
    expect(await bound.read('/notes/today')).toBe('hello');

    await bound.append('/notes/today', 'world');
    expect(await bound.read('/notes/today')).toBe('hello\nworld');

    const replaced = await bound.update('/notes/today', 'world', 'there');
    expect(replaced).toBe(1);
    const statFile = await bound.stat('/notes/today');
    expect(statFile.kind).toBe('file');
    expect(statFile.size).toBeGreaterThan(0);

    const rootList = await bound.list('/');
    expect(rootList).toEqual(expect.arrayContaining([{ name: 'notes', kind: 'dir' }]));
    const notesList = await bound.list('/notes');
    expect(notesList).toEqual(expect.arrayContaining([{ name: 'today', kind: 'file' }]));

    const deletion = await bound.delete('/notes');
    expect(deletion.files).toBe(1);
    expect(deletion.dirs).toBeGreaterThanOrEqual(1);
    expect((await bound.stat('/notes')).kind).toBe('none');
  });

  it('treats ensureDir as validation-only no-op', async () => {
    const nodeId = 'memory-service-ensure';
    await clear([nodeId]);
    const bound = svc.forMemory(nodeId, 'global');
    await expect(bound.ensureDir('/logs')).resolves.toBeUndefined();
    const list = await bound.list('/');
    expect(list).toEqual(expect.arrayContaining([{ name: 'logs', kind: 'dir' }]));
  });

  it('scopes entries by thread id when perThread', async () => {
    const nodeId = 'memory-service-scope';
    await clear([nodeId]);
    const globalSvc = svc.forMemory(nodeId, 'global');
    const t1 = svc.forMemory(nodeId, 'perThread', 't1');
    const t2 = svc.forMemory(nodeId, 'perThread', 't2');

    await globalSvc.append('/shared', 'GLOBAL');
    await t1.append('/shared', 'THREAD1');
    await t2.append('/shared', 'THREAD2');

    expect(await globalSvc.read('/shared')).toBe('GLOBAL');
    expect(await t1.read('/shared')).toBe('THREAD1');
    expect(await t2.read('/shared')).toBe('THREAD2');
  });
});
