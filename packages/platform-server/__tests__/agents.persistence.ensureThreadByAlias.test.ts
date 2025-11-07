import { describe, it, expect } from 'vitest';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { LoggerService } from '../src/core/services/logger.service';
import { NoopGraphEventsPublisher } from '../src/gateway/graph.events.publisher';
import { createPrismaStub, StubPrismaService } from './helpers/prisma.stub';

describe('AgentsPersistenceService: alias resolution helpers', () => {
  it('getOrCreateThreadByAlias creates a root thread with summary', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub) as any, new LoggerService(), { getThreadsMetrics: async () => ({}) } as any, new NoopGraphEventsPublisher());
    const id = await svc.getOrCreateThreadByAlias('test', 'root', 'Root summary');
    expect(typeof id).toBe('string');
    expect(stub._store.threads.length).toBe(1);
    expect(stub._store.threads[0].alias).toBe('root');
    expect(stub._store.threads[0].parentId).toBeNull();
    expect(stub._store.threads[0].summary).toBe('Root summary');
  });

  it('getOrCreateSubthreadByAlias creates child thread under parent and sets parentId', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub) as any, new LoggerService(), { getThreadsMetrics: async () => ({}) } as any, new NoopGraphEventsPublisher());
    const parentId = await svc.getOrCreateThreadByAlias('test', 'parentA', 'Parent A');
    const childId = await svc.getOrCreateSubthreadByAlias('manage', 'child1', parentId, 'Child 1');
    expect(typeof childId).toBe('string');
    expect(stub._store.threads.length).toBe(2);
    const parent = stub._store.threads.find((t: any) => t.alias === 'parentA');
    const child = stub._store.threads.find((t: any) => t.parentId === parent.id);
    expect(parent).toBeTruthy();
    expect(child).toBeTruthy();
    expect(child.parentId).toBe(parent.id);
    expect(child.summary).toBe('Child 1');
  });

  it('supports nested subthreads via explicit parent linkage', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub) as any, new LoggerService(), { getThreadsMetrics: async () => ({}) } as any, new NoopGraphEventsPublisher());
    const parentId = await svc.getOrCreateThreadByAlias('test', 'parentB', 'Parent B');
    const childId = await svc.getOrCreateSubthreadByAlias('manage', 'child2', parentId, 'Child 2');
    const leafId = await svc.getOrCreateSubthreadByAlias('manage', 'leafX', childId, 'Leaf X');
    expect(typeof leafId).toBe('string');
    expect(stub._store.threads.length).toBe(3);
    const parent = stub._store.threads.find((t: any) => t.alias === 'parentB');
    const child = stub._store.threads.find((t: any) => t.parentId === parent.id);
    const leaf = stub._store.threads.find((t: any) => t.parentId === child.id);
    expect(parent).toBeTruthy();
    expect(child).toBeTruthy();
    expect(leaf).toBeTruthy();
    expect(child.parentId).toBe(parent.id);
    expect(leaf.parentId).toBe(child.id);
    expect(leaf.summary).toBe('Leaf X');
  });

  it('getOrCreateThreadByAlias is idempotent for existing alias', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub) as any, new LoggerService(), { getThreadsMetrics: async () => ({}) } as any, new NoopGraphEventsPublisher());
    const aId1 = await svc.getOrCreateThreadByAlias('test', 'A', 'first');
    const aId2 = await svc.getOrCreateThreadByAlias('test', 'A', 'second');
    expect(aId1).toBe(aId2);
    const childId1 = await svc.getOrCreateSubthreadByAlias('manage', 'B', aId1, 'child first');
    const childId2 = await svc.getOrCreateSubthreadByAlias('manage', 'B', aId1, 'child second');
    expect(childId1).toBe(childId2);
    const root = stub._store.threads.find((t: any) => t.alias === 'A');
    expect(root.summary).toBe('first');
    const composed = `manage:${aId1}:B`;
    const child = stub._store.threads.find((t: any) => t.alias === composed);
    expect(child.summary).toBe('child first');
  });

  it('validates summary length <= 1024 and trims whitespace on create', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub) as any, new LoggerService(), { getThreadsMetrics: async () => ({}) } as any, new NoopGraphEventsPublisher());
    const long = 'x'.repeat(1025);
    await expect(svc.getOrCreateThreadByAlias('test', 'root-long', long)).rejects.toBeTruthy();
    const id = await svc.getOrCreateThreadByAlias('test', 'root-trim', '   hello   ');
    const t = stub._store.threads.find((tt: any) => tt.id === id);
    expect(t.summary).toBe('hello');
  });

  it('beginRunThread does not mutate Thread.summary', async () => {
    const stub = createPrismaStub();
    const svc = new AgentsPersistenceService(new StubPrismaService(stub) as any, new LoggerService(), { getThreadsMetrics: async () => ({}) } as any, new NoopGraphEventsPublisher());
    const id = await svc.getOrCreateThreadByAlias('test', 'root-nochange', 'Initial summary');
    await svc.beginRunThread(id, []);
    const t = stub._store.threads.find((tt: any) => tt.id === id);
    expect(t.summary).toBe('Initial summary');
  });
});
