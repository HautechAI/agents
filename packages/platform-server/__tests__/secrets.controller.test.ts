import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { GraphRepository } from '../src/graph/graph.repository';
import type { PersistedGraph } from '../src/graph/types';
import { SecretsService } from '../src/secrets/secrets.service';
import { SecretsController } from '../src/secrets/secrets.controller';
import type { VaultRef } from '../src/vault/vault.service';

class GraphRepoStub implements GraphRepository {
  private snapshot: PersistedGraph = {
    name: 'main', version: 1, updatedAt: new Date().toISOString(),
    nodes: [
      { id: 'a', template: 't', config: { foo: { source: 'vault', value: 'secret/app/api_key' } } },
      { id: 'b', template: 't', config: { source: 'vault', value: 'secret/app/other' } },
      { id: 'c', template: 't', config: { nested: { arr: [ { source: 'vault', value: 'secret/app/db_password' }, 'x' ] } } },
    ], edges: [], variables: []
  };
  async initIfNeeded(): Promise<void> {}
  async get(name: string): Promise<PersistedGraph | null> { return name === 'main' ? this.snapshot : null; }
  async upsert(): Promise<PersistedGraph> { return this.snapshot; }
  async upsertNodeState(): Promise<void> {}
}

class VaultStub {
  keysByPath = new Map<string, string[]>([
    ['secret@@app', ['api_key', 'db_password', 'extra_unused'] ],
  ]);
  async listKeys(mount: string, path: string): Promise<string[]> {
    const k = `${mount}@@${path}`; return this.keysByPath.get(k) || [];
  }
  async getSecret(ref: VaultRef): Promise<string | undefined> {
    if (ref.mount === 'secret' && ref.path === 'app') {
      if (ref.key === 'api_key') return 'API-SECRET';
      if (ref.key === 'db_password') return 'DB-SECRET';
      return undefined;
    }
    return undefined;
  }
}

class LoggerStub { debug = vi.fn(); }

describe('SecretsController', () => {
  let fastify: any; let repo: GraphRepoStub; let vault: VaultStub; let service: SecretsService; let controller: SecretsController; let logger: LoggerStub;
  const oldEnv = { ...process.env };
  beforeEach(async () => {
    fastify = Fastify({ logger: false }); repo = new GraphRepoStub(); vault = new VaultStub(); logger = new LoggerStub();
    service = new SecretsService(repo as unknown as GraphRepository, vault as any, logger as any);
    controller = new SecretsController(service as any, vault as any, logger as any);
    fastify.get('/api/secrets/summary', async (req, res) => res.send(await controller.getSummary(req.query as any)));
  });
  afterEach(() => { process.env = { ...oldEnv }; });

  it('summarizes secrets scoped to used mount/path pairs', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/secrets/summary', query: { filter: 'all', page: '1', page_size: '100' } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ ref: string; status: string }>; summary: { counts: Record<string, number> } };
    const refs = body.items.map((i: any) => i.ref).sort();
    expect(refs).toContain('secret/app/api_key');
    expect(refs).toContain('secret/app/db_password');
    expect(refs).toContain('secret/app/extra_unused');
    // invalid_ref count should be 0
    expect(body.summary.counts.invalid_ref).toBe(0);
    // used_present: api_key, db_password (both listed in vault)
    // present_unused: extra_unused
    const statuses = Object.values(body.summary.counts).reduce((a, b) => a + b, 0);
    expect(statuses).toBeGreaterThan(0);
  });

  it('enforces unmask security: flag off => 403', async () => {
    process.env.VAULT_READ_ALLOW_UNMASK = 'false'; process.env.ADMIN_READ_TOKEN = 'adm';
    await expect(controller.readSecret('secret', 'app', 'api_key', { reveal: '1' } as any, { 'X-Admin-Token': 'adm' } as any)).rejects.toMatchObject({ status: 403 });
  });

  it('enforces unmask security: flag on + wrong token => 403', async () => {
    process.env.VAULT_READ_ALLOW_UNMASK = 'true'; process.env.ADMIN_READ_TOKEN = 'adm';
    await expect(controller.readSecret('secret', 'app', 'api_key', { reveal: 'true' } as any, { 'X-Admin-Token': 'bad' } as any)).rejects.toMatchObject({ status: 403 });
  });

  it('allows unmask with correct token', async () => {
    process.env.VAULT_READ_ALLOW_UNMASK = 'true'; process.env.ADMIN_READ_TOKEN = 'adm';
    const body = await controller.readSecret('secret', 'app', 'api_key', { reveal: '1' } as any, { 'x-admin-token': 'adm' } as any) as { masked: boolean; value?: string; status: string };
    expect(body.masked).toBe(false);
    expect(body.status).toBe('present');
    expect(body.value).toBe('API-SECRET');
    // Logger should not log plaintext, only debug messages
    expect(logger.debug).toHaveBeenCalledTimes(0);
  });
});
