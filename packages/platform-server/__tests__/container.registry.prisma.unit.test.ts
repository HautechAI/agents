import { describe, it, expect, beforeEach } from 'vitest';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import { LoggerService } from '../src/core/services/logger.service';

type ContainerRow = {
  containerId: string;
  nodeId: string;
  threadId: string | null;
  providerType: 'docker';
  image: string;
  status: 'running' | 'stopped' | 'terminating' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date;
  killAfterAt: Date | null;
  terminationReason: string | null;
  deletedAt: Date | null;
  metadata: Record<string, any> | null;
};

class FakePrismaClient {
  private rows = new Map<string, ContainerRow>();
  container = {
    upsert: async (args: any) => {
      const key = args.where.containerId as string;
      const existing = this.rows.get(key);
      if (!existing) {
        const create = args.create;
        const now = new Date();
        const row: ContainerRow = {
          containerId: create.containerId,
          nodeId: create.nodeId,
          threadId: create.threadId ?? null,
          providerType: 'docker',
          image: create.image,
          status: create.status,
          createdAt: now,
          updatedAt: now,
          lastUsedAt: create.lastUsedAt,
          killAfterAt: create.killAfterAt ?? null,
          terminationReason: null,
          deletedAt: null,
          metadata: create.metadata ?? null,
        };
        this.rows.set(key, row);
        return row;
      } else {
        const update = args.update;
        existing.nodeId = update.nodeId;
        existing.threadId = update.threadId ?? null;
        existing.image = update.image;
        existing.status = update.status;
        existing.updatedAt = new Date();
        existing.lastUsedAt = update.lastUsedAt ?? existing.lastUsedAt;
        existing.killAfterAt = update.killAfterAt ?? existing.killAfterAt;
        existing.terminationReason = update.terminationReason ?? existing.terminationReason;
        existing.deletedAt = update.deletedAt ?? existing.deletedAt;
        existing.metadata = update.metadata ?? existing.metadata;
        return existing;
      }
    },
    findUnique: async (args: any) => {
      const key = args.where.containerId as string;
      return this.rows.get(key) || null;
    },
    update: async (args: any) => {
      const key = args.where.containerId as string;
      const existing = this.rows.get(key);
      if (!existing) throw new Error('Not found');
      const data = args.data;
      existing.updatedAt = new Date();
      if ('status' in data) existing.status = data.status;
      if ('terminationReason' in data) existing.terminationReason = data.terminationReason ?? existing.terminationReason;
      if ('deletedAt' in data) existing.deletedAt = data.deletedAt ?? existing.deletedAt;
      if ('lastUsedAt' in data) existing.lastUsedAt = data.lastUsedAt ?? existing.lastUsedAt;
      if ('killAfterAt' in data) existing.killAfterAt = data.killAfterAt ?? existing.killAfterAt;
      if ('metadata' in data) existing.metadata = data.metadata ?? existing.metadata;
      return existing;
    },
    updateMany: async (args: any) => {
      const id = args.where.containerId as string;
      const status = args.where.status as string;
      const row = this.rows.get(id);
      if (row && row.status === status) {
        row.status = args.data.status;
        row.metadata = args.data.metadata ?? row.metadata;
        row.updatedAt = new Date();
        return { count: 1 };
      }
      return { count: 0 };
    },
    findMany: async (args: any) => {
      if (args?.where?.status && args?.where?.killAfterAt) {
        const notNull = args.where.killAfterAt.not === null;
        const lte = args.where.killAfterAt.lte as Date;
        return Array.from(this.rows.values()).filter(
          (r) => r.status === args.where.status && (notNull ? r.killAfterAt != null : true) && (r.killAfterAt! <= lte),
        );
      }
      if (args?.where?.containerId?.in) {
        const ids: string[] = args.where.containerId.in;
        return ids.map((id) => this.rows.get(id)).filter(Boolean) as ContainerRow[];
      }
      return Array.from(this.rows.values());
    },
  };
  async $queryRaw(strings: TemplateStringsArray, ...values: any[]): Promise<Array<{ containerId: string }>> {
    const nowIso = values[0] as string;
    const now = new Date(nowIso);
    const results = Array.from(this.rows.values())
      .filter((r) => r.status === 'terminating')
      .filter((r) => {
        const ra = r.metadata?.retryAfter as string | undefined;
        if (!ra) return true;
        try {
          return new Date(ra) <= now;
        } catch {
          return false;
        }
      })
      .map((r) => ({ containerId: r.containerId }));
    return results;
  }
}

class NoopLogger implements LoggerService {
  info(): void {}
  error(): void {}
  debug(): void {}
}

describe('ContainerRegistry (Prisma-backed)', () => {
  let prisma: FakePrismaClient;
  let registry: ContainerRegistry;

  beforeEach(() => {
    prisma = new FakePrismaClient();
    registry = new ContainerRegistry(prisma as any, new NoopLogger());
  });

  it('registerStart creates records deterministically', async () => {
    await registry.registerStart({
      containerId: 'abc',
      nodeId: 'node-1',
      threadId: '00000000-0000-0000-0000-000000000001',
      image: 'node:20',
      labels: { 'hautech.ai/role': 'workspace' },
      ttlSeconds: 10,
    });
    const row = await (prisma as any).container.findUnique({ where: { containerId: 'abc' } });
    expect(row).toBeTruthy();
    expect(row.status).toBe('running');
    expect(row.killAfterAt).not.toBeNull();
    expect(row.metadata.ttlSeconds).toBe(10);
  });

  it('updateLastUsed does not create when missing', async () => {
    const before = await (prisma as any).container.findMany({});
    expect(before.length).toBe(0);
    await registry.updateLastUsed('missing');
    const after = await (prisma as any).container.findMany({});
    expect(after.length).toBe(0);
  });

  it('claimForTermination performs CAS update', async () => {
    await registry.registerStart({ containerId: 'cid1', nodeId: 'n', threadId: '', image: 'img' });
    const ok1 = await registry.claimForTermination('cid1', 'claim');
    expect(ok1).toBe(true);
    const ok2 = await registry.claimForTermination('cid1', 'claim2');
    expect(ok2).toBe(false);
  });

  it('getExpired returns running past killAfter and terminating past retryAfter', async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 1000);
    const future = new Date(now.getTime() + 60_000);
    await registry.registerStart({ containerId: 'r1', nodeId: 'n', threadId: '', image: 'img', ttlSeconds: 0 });
    await (prisma as any).container.update({ where: { containerId: 'r1' }, data: { killAfterAt: past } });
    await registry.registerStart({ containerId: 't1', nodeId: 'n', threadId: '', image: 'img' });
    await (prisma as any).container.update({ where: { containerId: 't1' }, data: { status: 'terminating', metadata: {} } });
    await registry.registerStart({ containerId: 't2', nodeId: 'n', threadId: '', image: 'img' });
    await (prisma as any).container.update({
      where: { containerId: 't2' },
      data: { status: 'terminating', metadata: { retryAfter: future.toISOString() } },
    });
    const expired = await registry.getExpired(now);
    const ids = expired.map((r: any) => r.containerId);
    expect(ids).toContain('r1');
    expect(ids).toContain('t1');
    expect(ids).not.toContain('t2');
  });

  it('recordTerminationFailure sets backoff metadata', async () => {
    await registry.registerStart({ containerId: 'x', nodeId: 'n', threadId: '', image: 'img' });
    await registry.markTerminating('x', 'cleanup');
    await registry.recordTerminationFailure('x', 'oops');
    const row = await (prisma as any).container.findUnique({ where: { containerId: 'x' } });
    expect(row.metadata.lastError).toBe('oops');
    expect(typeof row.metadata.retryAfter).toBe('string');
    expect(row.metadata.terminationAttempts).toBe(1);
  });

  it('markStopped sets status and deletedAt', async () => {
    await registry.registerStart({ containerId: 'y', nodeId: 'n', threadId: '', image: 'img' });
    await registry.markStopped('y', 'ttl_expired');
    const row = await (prisma as any).container.findUnique({ where: { containerId: 'y' } });
    expect(row.status).toBe('stopped');
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(row.terminationReason).toBe('ttl_expired');
  });
});

