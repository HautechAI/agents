import { describe, it, expect } from 'vitest';
import { AgentsPersistenceService } from '../src/agents/agents.persistence.service';
import { LoggerService } from '../src/core/services/logger.service';
import { NoopGraphEventsPublisher } from '../src/gateway/graph.events.publisher';
import { StubPrismaService, createPrismaStub } from './helpers/prisma.stub';

describe('AgentsPersistenceService thread channel', () => {
  it('set/get Thread.channel with validation', async () => {
    const prismaStub = createPrismaStub();
    const svc = new AgentsPersistenceService(
      new StubPrismaService(prismaStub) as any,
      new LoggerService(),
      { getThreadsMetrics: async () => ({}) } as any,
      new NoopGraphEventsPublisher(),
    );
    const threadId = await svc.getOrCreateThreadByAlias('test', 'alias-x');
    const info = { type: 'slack', channel: 'C123', thread_ts: '1700000000.000100', user: 'U999' };
    await svc.setThreadChannel(threadId, info);
    const loaded = await svc.getThreadChannel(threadId);
    expect(loaded).toEqual(info);
  });
  it('getThreadChannel returns null on invalid shape', async () => {
    const prismaStub = createPrismaStub();
    const svc = new AgentsPersistenceService(
      new StubPrismaService(prismaStub) as any,
      new LoggerService(),
      { getThreadsMetrics: async () => ({}) } as any,
      new NoopGraphEventsPublisher(),
    );
    const threadId = await svc.getOrCreateThreadByAlias('test', 'alias-y');
    // Bypass validation: set raw invalid channel field via prisma stub
    await prismaStub.thread.update({ where: { id: threadId }, data: { channel: { bad: 'shape' } } });
    const loaded = await svc.getThreadChannel(threadId);
    expect(loaded).toBeNull();
  });
});
