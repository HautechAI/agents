import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { ContainerRegistryService } from '../services/containerRegistry.service';
import { LoggerService } from '../services/logger.service';

describe('ContainerRegistryService backfill last_used behavior', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let registry: ContainerRegistryService;
  const logger = new LoggerService();
  let setupOk = true;

  beforeAll(async () => {
    try {
      mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
      client = await MongoClient.connect(mongod.getUri());
      registry = new ContainerRegistryService(client.db('test'), logger);
      await registry.ensureIndexes();
    } catch (e: any) {
      setupOk = false;
      // eslint-disable-next-line no-console
      console.warn('Skipping backfill last_used tests: mongodb-memory-server unavailable:', e?.message || e);
    }
  });

  afterAll(async () => {
    if (client) await client.close().catch(() => {});
    if (mongod) await mongod.stop().catch(() => {});
  });

  it('does not modify last_used_at for existing running container on backfill', async () => {
    if (!setupOk) return;
    const col = client.db('test').collection('containers');
    const cid = 'exist-1';
    const past = new Date(Date.now() - 60_000).toISOString();
    await col.insertOne({
      container_id: cid,
      node_id: 'n',
      thread_id: 't',
      provider_type: 'docker',
      image: 'img',
      status: 'running',
      created_at: past,
      updated_at: past,
      last_used_at: past,
      kill_after_at: new Date(new Date(past).getTime() + 86400 * 1000).toISOString(),
      termination_reason: null,
      deleted_at: null,
      metadata: { ttlSeconds: 86400, labels: { 'hautech.ai/role': 'workspace' } },
    });

    const fake = {
      findContainersByLabels: async () => [{ id: cid }],
      getContainerLabels: async () => ({ 'hautech.ai/role': 'workspace', 'hautech.ai/thread_id': 'node__t' }),
      getDocker: () => ({
        getContainer: (_id: string) => ({
          inspect: async () => ({ Created: past, State: { Running: true }, Config: { Image: 'img' } }),
        }),
      }),
    } as any;

    await registry.backfillFromDocker(fake);
    const after = await col.findOne({ container_id: cid });
    expect(after?.last_used_at).toBe(past);
    // Ensure we didn't null out or change kill_after_at when it already existed
    expect(after?.kill_after_at).toBeTruthy();
  });

  it('sets last_used_at and kill_after_at for newly discovered running container', async () => {
    if (!setupOk) return;
    const col = client.db('test').collection('containers');
    const cid = 'new-1';
    const now = Date.now();
    const fake = {
      findContainersByLabels: async () => [{ id: cid }],
      getContainerLabels: async () => ({ 'hautech.ai/role': 'workspace', 'hautech.ai/thread_id': 'node__t2' }),
      getDocker: () => ({
        getContainer: (_id: string) => ({
          inspect: async () => ({ Created: new Date(now).toISOString(), State: { Running: true }, Config: { Image: 'img' } }),
        }),
      }),
    } as any;

    await registry.backfillFromDocker(fake);
    const doc = await col.findOne({ container_id: cid });
    expect(doc).toBeTruthy();
    expect(typeof doc!.last_used_at).toBe('string');
    expect(doc!.kill_after_at).toBeTruthy();
    const lu = new Date(doc!.last_used_at).getTime();
    const ka = new Date(doc!.kill_after_at!).getTime();
    // last_used_at should be roughly now (within 5s)
    expect(Math.abs(lu - now)).toBeLessThan(5000);
    // kill_after ~ last_used + 86400s (allow 5s slop)
    expect(Math.abs(ka - (lu + 86400 * 1000))).toBeLessThan(5000);
  });

  it('touchLastUsed path still updates last_used_at', async () => {
    if (!setupOk) return;
    const col = client.db('test').collection('containers');
    const cid = 'touch-1';
    await registry.registerStart({ containerId: cid, nodeId: 'n', threadId: 't', image: 'img' });
    const before = await col.findOne({ container_id: cid });
    const future = new Date(Date.now() + 12345);
    await registry.updateLastUsed(cid, future);
    const after = await col.findOne({ container_id: cid });
    expect(after?.last_used_at).toBe(future.toISOString());
    expect(after?.kill_after_at).toBeTruthy();
    expect(after?.kill_after_at).not.toBe(before?.kill_after_at);
  });
});

