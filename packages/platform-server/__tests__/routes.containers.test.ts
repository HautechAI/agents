import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { ContainersController } from '../src/infra/container/containers.controller';
import type { PrismaService } from '../src/core/services/prisma.service';
import { LoggerService } from '../src/core/services/logger.service';
import { ContainerService } from '../src/infra/container/container.service';
import { ContainerRegistry } from '../src/infra/container/container.registry';
import type { PrismaClient } from '@prisma/client';

type Row = {
  containerId: string;
  threadId: string | null;
  role?: 'workspace' | 'dind';
  metadata?: unknown;
  image: string;
  status: 'running' | 'stopped' | 'terminating' | 'failed';
  createdAt: Date;
  lastUsedAt: Date;
  killAfterAt: Date | null;
  nodeId?: string;
};

type SortOrder = 'asc' | 'desc';
type ContainerWhereInput = {
  status?: Row['status'];
  threadId?: string | null;
  image?: string;
  nodeId?: string;
};
type ContainerOrderByInput = { createdAt?: SortOrder; lastUsedAt?: SortOrder; killAfterAt?: SortOrder };
type ContainerSelect = {
  containerId?: boolean;
  threadId?: boolean;
  role?: boolean;
  metadata?: boolean;
  image?: boolean;
  status?: boolean;
  createdAt?: boolean;
  lastUsedAt?: boolean;
  killAfterAt?: boolean;
};
type FindManyArgs = { where?: ContainerWhereInput; orderBy?: ContainerOrderByInput; select?: ContainerSelect; take?: number };
type SelectedRow = { containerId: string; threadId: string | null; role?: Row['role']; metadata?: unknown; image: string; status: Row['status']; createdAt: Date; lastUsedAt: Date; killAfterAt: Date | null };

class InMemoryPrismaClient {
  container = {
    rows: [] as Row[],
    async findMany(args: FindManyArgs): Promise<SelectedRow[]> {
      const where = args?.where || {};
      let items = this.rows.slice();
      if (where.status) items = items.filter((r) => r.status === where.status);
      if (typeof where.threadId !== 'undefined') items = items.filter((r) => r.threadId === where.threadId);
      if (typeof where.image !== 'undefined') items = items.filter((r) => r.image === where.image);
      if (typeof where.nodeId !== 'undefined') items = items.filter((r) => r.nodeId === where.nodeId);
      const orderBy = args?.orderBy || { lastUsedAt: 'desc' };
      const [[col, dir]] = Object.entries(orderBy) as [keyof ContainerOrderByInput, SortOrder][];
      items.sort((a, b) => {
        const av = (col === 'createdAt' ? a.createdAt : col === 'killAfterAt' ? a.killAfterAt : a.lastUsedAt) || new Date(0);
        const bv = (col === 'createdAt' ? b.createdAt : col === 'killAfterAt' ? b.killAfterAt : b.lastUsedAt) || new Date(0);
        return dir === 'asc' ? av.getTime() - bv.getTime() : bv.getTime() - av.getTime();
      });
      const take = typeof args?.take === 'number' ? args.take : items.length;
      return items.slice(0, take).map((r) => ({
        containerId: r.containerId,
        threadId: r.threadId,
        role: r.role,
        metadata: r.metadata,
        image: r.image,
        status: r.status,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt,
        killAfterAt: r.killAfterAt,
      }));
    },
  };
}

type MinimalPrismaClient = { container: { findMany(args: FindManyArgs): Promise<SelectedRow[]>; rows: Row[] } };
class PrismaStub {
  client: MinimalPrismaClient = new InMemoryPrismaClient();
  getClient(): MinimalPrismaClient { return this.client; }
}

describe('ContainersController routes', () => {
  let fastify: any; let prismaSvc: PrismaStub; let controller: ContainersController;
  class FakeContainerService extends ContainerService {
    constructor() {
      // Provide inert registry; it won't be used in these tests
      const dummyPrisma = {} as unknown as PrismaClient;
      const logger = new LoggerService();
      super(logger, new ContainerRegistry(dummyPrisma, logger));
    }
    override async findContainersByLabels(): Promise<Array<{ id: string }>> { return []; }
    override getDocker() { return { getContainer: (_id: string) => ({ inspect: async () => ({}) }) } as unknown as ReturnType<ContainerService['getDocker']>; }
  }

  beforeEach(async () => {
    fastify = Fastify({ logger: false }); prismaSvc = new PrismaStub();
    controller = new ContainersController(prismaSvc as unknown as PrismaService, new FakeContainerService(), new LoggerService());
    fastify.get('/api/containers', async (req, res) => {
      return res.send(await controller.list((req as any).query));
    });
    // seed data
    const now = Date.now();
    const mk = (i: number, status: Row['status'], threadId: string | null): Row => ({
      containerId: `cid-${i}`,
      threadId,
      role: 'workspace',
      metadata: { labels: { 'hautech.ai/role': 'workspace' } },
      image: `img:${i}`,
      status,
      createdAt: new Date(now - i * 1000),
      lastUsedAt: new Date(now - i * 500),
      killAfterAt: i % 2 === 0 ? new Date(now + 10000 + i) : null,
    });
    const rows: Row[] = [mk(1, 'running', '11111111-1111-1111-1111-111111111111'), mk(2, 'running', null), mk(3, 'stopped', null)];
    prismaSvc.client.container.rows = rows;
  });

  it('lists running containers by default and maps startedAt', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/containers' }); expect(res.statusCode).toBe(200);
    type ContainerTestItem = { containerId: string; threadId: string | null; role: string; image: string; status: string; startedAt: string; lastUsedAt: string; killAfterAt: string | null };
    type ListResponse = { items: ContainerTestItem[] };
    const body = res.json() as ListResponse;
    const items = body.items;
    // default filter excludes stopped
    expect(items.every((i) => i.status === 'running')).toBe(true);
    // startedAt should exist and be derived from createdAt
    const first = items[0]; expect(typeof first.startedAt).toBe('string'); expect(typeof first.lastUsedAt).toBe('string');
    // verify mapping equals underlying createdAt ISO
    const src = prismaSvc.client.container.rows.find((r) => r.containerId === first.containerId)!;
    expect(first.startedAt).toBe(src.createdAt.toISOString());
    // role should be returned from DB
    expect(first.role).toBe('workspace');
  });

  it('defaults role to workspace when DB role is null', async () => {
    // add a row without role set
    const now = Date.now();
    const row: Row = {
      containerId: 'cid-missing-metadata',
      threadId: null,
      role: undefined,
      image: 'img:missing',
      status: 'running',
      createdAt: new Date(now - 5000),
      lastUsedAt: new Date(now - 4000),
      killAfterAt: null,
    };
    prismaSvc.client.container.rows.push(row);
    const res = await fastify.inject({ method: 'GET', url: '/api/containers' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ containerId: string; role: string }> };
    const found = body.items.find((i) => i.containerId === 'cid-missing-metadata');
    expect(found?.role).toBe('workspace');
  });

  // Labels are no longer used to derive role in list endpoint

  it('supports sorting by lastUsedAt desc', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/containers?sortBy=lastUsedAt&sortDir=desc' }); expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ containerId: string }> }).items;
    // mk(1) has lastUsedAt newer than mk(2)
    expect(items[0].containerId).toBe('cid-1');
  });

  it('filters by threadId when provided', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/containers?threadId=11111111-1111-1111-1111-111111111111' }); expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ threadId: string | null }> }).items;
    expect(items.length).toBe(1);
    expect(items[0].threadId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('applies limit bounds and returns at most requested items', async () => {
    // add more running rows
    const now = Date.now();
    const mkRun = (i: number): Row => ({
      containerId: `cid-x-${i}`,
      threadId: null,
      image: `imgx:${i}`,
      status: 'running',
      createdAt: new Date(now - i * 2000),
      lastUsedAt: new Date(now - i * 1000),
      killAfterAt: null,
    });
    prismaSvc.client.container.rows.push(mkRun(4), mkRun(5), mkRun(6));
    const res = await fastify.inject({ method: 'GET', url: '/api/containers?limit=1' });
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ containerId: string }> }).items;
    expect(items.length).toBe(1);
  });
});

