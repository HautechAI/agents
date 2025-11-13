import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { NixResolverService, NixResolverError } from '../src/infra/nix/nix-resolver.service';

class StubLogger {
  info() {}
  debug() {}
  warn() {}
  error() {}
}

describe('NixResolverService', () => {
  let service: NixResolverService;
  let config: ConfigService;
  const store: any[] = [];

  const mongoStub = {
    getDb: () => ({
      collection: () => ({
        createIndex: async () => undefined,
        find: (query: Record<string, unknown>) => ({
          project: () => ({
            toArray: async () =>
              store.filter((doc) =>
                doc.name === query.name &&
                doc.version === query.version &&
                doc.system === query.system &&
                (!query.channel || (query.channel as { $in: string[] }).$in.includes(doc.channel)) &&
                (!query.expiresAt || doc.expiresAt > (query.expiresAt as { $gt: Date }).$gt),
              ),
          }),
        }),
        updateOne: async (
          filter: { name: string; version: string; system: string; channel: string },
          update: { $set: { attributePath: string; commitHash: string; source: string; resolvedAt: Date; expiresAt: Date } },
        ) => {
          const idx = store.findIndex(
            (doc) =>
              doc.name === filter.name &&
              doc.version === filter.version &&
              doc.system === filter.system &&
              doc.channel === filter.channel,
          );
          const doc = { ...filter, ...update.$set };
          if (idx >= 0) store[idx] = doc;
          else store.push(doc);
        },
      }),
    }),
  } as const;

  beforeEach(() => {
    nock.cleanAll();
    store.length = 0;
    config = new ConfigService().init(
      configSchema.parse({
        llmProvider: 'openai',
        githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', githubToken: 'x', mongodbUrl: 'mongodb://localhost:27017/test',
        agentsDatabaseUrl: 'postgres://localhost:5432/agents',
        graphStore: 'mongo', graphRepoPath: './graph', graphBranch: 'graph',
        dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: 'nixpkgs-unstable',
        nixHttpTimeoutMs: String(200), nixCacheTtlMs: String(30_000), nixCacheMax: String(100),
        nixResolverCacheTtlMs: String(60_000),
        nixResolverStrategy: 'hybrid', nixResolverTotalBudgetMs: String(1500), nixResolverTimeoutMs: String(200),
        nixResolverEnableAsync: 'false',
        mcpToolsStaleTimeoutMs: '0', ncpsEnabled: 'false', ncpsUrl: 'http://ncps:8501',
        ncpsRefreshIntervalMs: '0',
      }),
    );
    service = new NixResolverService(config, new StubLogger() as any, mongoStub as any);
  });

  it('resolves via nixhub, caches result, and stores in mongo', async () => {
    const scope = nock('https://www.nixhub.io')
      .get('/packages/htop')
      .query(true)
      .reply(200, {
        name: 'htop',
        releases: [
          {
            version: '3.2.1',
            platforms: [
              { attribute_path: 'pkgs.htop', commit_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
            ],
          },
        ],
      });

    const result = await service.resolve({ name: 'htop', version: '3.2.1' });
    expect(result).toMatchObject({
      attributePath: 'pkgs.htop',
      commitHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      source: 'nixhub',
      fromCache: false,
    });
    scope.done();

    const second = await service.resolve({ name: 'htop', version: '3.2.1' });
    expect(second.fromCache).toBe(true);
    expect(second.attributePath).toBe('pkgs.htop');

    expect(store[0]?.attributePath).toBe('pkgs.htop');
  });

  it('falls back to nix search when nixhub lacks commit', async () => {
    const nixhubScope = nock('https://www.nixhub.io')
      .get('/packages/pkg')
      .query(true)
      .reply(200, {
        name: 'pkg',
        releases: [
          {
            version: '1.0.0',
            platforms: [{ attribute_path: 'pkg' }],
          },
        ],
      });

    const searchScope = nock('https://search.nixos.org')
      .post('/backend/latest-44-nixos-unstable/_search')
      .reply(200, {
        hits: {
          hits: [
            {
              _index: 'nixos-44-unstable-1234567890abcdef1234567890abcdef12345678',
              _score: 1.0,
              _source: {
                package_attr_name: 'pkg',
                package_pversion: '1.0.0',
                package_platforms: ['x86_64-linux'],
                package_system: 'x86_64-linux',
              },
            },
          ],
        },
      });

    const result = await service.resolve({ name: 'pkg', version: '1.0.0' });
    expect(result.source).toBe('nixos-search-attr');
    expect(result.commitHash).toBe('1234567890abcdef1234567890abcdef12345678');
    expect(result.fromCache).toBe(false);
    nixhubScope.done();
    searchScope.done();
  });

  it('throws not_found when neither nixhub nor search returns', async () => {
    nock('https://www.nixhub.io').get('/packages/missing').query(true).reply(404, 'not found');
    nock('https://search.nixos.org').post(/_search/).reply(404, 'missing');

    await expect(service.resolve({ name: 'missing', version: '0.0.1' })).rejects.toMatchObject({ kind: 'not_found' satisfies NixResolverError['kind'] });
  });
});
