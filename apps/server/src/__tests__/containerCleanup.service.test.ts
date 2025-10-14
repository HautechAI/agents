import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { ContainerRegistryService } from '../services/containerRegistry.service';
import { ContainerCleanupService } from '../services/containerCleanup.service';
import { LoggerService } from '../services/logger.service';

class FakeContainerService {
  stopped: string[] = [];
  removed: string[] = [];
  async stopContainer(id: string, _t?: number) { this.stopped.push(id); }
  async removeContainer(id: string, _force?: boolean) { this.removed.push(id); }
}

describe('ContainerCleanupService', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let registry: ContainerRegistryService;
  const logger = new LoggerService();
  const fakeSvc = new FakeContainerService() as any;

  beforeAll(async () => {
    process.env.CONTAINERS_CLEANUP_ENABLED = 'true';
    mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
    client = await MongoClient.connect(mongod.getUri());
    registry = new ContainerRegistryService(client.db('test'), logger);
    await registry.ensureIndexes();
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  it('sweeps expired containers and marks stopped', async () => {
    const cid = 'xyz000';
    await registry.registerStart({ containerId: cid, nodeId: 'n', threadId: 't', image: 'i', ttlSeconds: 1 });
    const col = client.db('test').collection('containers');
    const past = new Date(Date.now() - 10_000).toISOString();
    await col.updateOne({ container_id: cid }, { $set: { last_used_at: past, kill_after_at: past } });
    const svc = new ContainerCleanupService(registry, fakeSvc, logger);
    await svc.sweep(new Date());
    const doc = await col.findOne({ container_id: cid });
    expect(doc?.status).toBe('stopped');
    expect(fakeSvc.stopped).toContain(cid);
    expect(fakeSvc.removed).toContain(cid);
  });
});

