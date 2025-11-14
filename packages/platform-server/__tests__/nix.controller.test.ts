import { readFileSync } from 'node:fs';
import nock from 'nock';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// Avoid Nest TestingModule; instantiate controller with DI stubs
import { NixController } from '../src/infra/ncps/nix.controller';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import type { FastifyReply } from 'fastify';

const BASE = 'https://www.nixhub.io';

const loadFixture = <T>(file: string): T =>
  JSON.parse(readFileSync(new URL(`./fixtures/nixhub/${file}`, import.meta.url), 'utf-8')) as T;

type SearchFixture = {
  query: string;
  total_results: number;
  results: { name: string; summary: string; last_updated: string }[];
};

type PackageFixture = {
  name: string;
  summary?: string;
  releases: {
    version: string | number;
    last_updated?: string;
    outputs_summary?: string;
    platforms_summary?: string;
    commit_hash?: string;
    platforms: { system: string; attribute_path?: string }[];
  }[];
};

describe('nix controller', () => {
  let controller: NixController;
  let reply: FastifyReply;
  beforeEach(() => {
    const cfg = new ConfigService().init(
      configSchema.parse({
        llmProvider: 'openai',
        githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', githubToken: 'x', mongodbUrl: 'x',
        agentsDatabaseUrl: 'postgres://localhost:5432/agents',
        graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
        dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: 'nixpkgs-unstable',
        nixHttpTimeoutMs: String(200), nixCacheTtlMs: String(5 * 60_000), nixCacheMax: String(500),
        mcpToolsStaleTimeoutMs: '0', ncpsEnabled: 'false', ncpsUrl: 'http://ncps:8501',
        ncpsRefreshIntervalMs: '0',
      })
    );
    controller = new NixController(cfg);
    reply = {
      code: vi.fn(() => reply) as any,
      header: vi.fn(() => reply) as any,
    } as unknown as FastifyReply;
  });
  afterEach(() => nock.cleanAll());

  it('packages: success mapping and strict upstream URL', async () => {
    const searchGit = loadFixture<SearchFixture>('search.git.json');
    const scope = nock(BASE)
      .get('/search')
      .query((q) => q.q === 'git' && q._data === 'routes/_nixhub.search')
      .reply(200, searchGit);
    const body = await controller.packages({ query: 'git' }, reply);
    expect(Array.isArray(body.packages)).toBe(true);
    expect(body.packages[0].name).toBe('git');
    scope.done();
  });

  it('packages: 502 retry then success', async () => {
    const searchRetry = loadFixture<SearchFixture>('search.python.json');
    const scope = nock(BASE).get('/search').query(true).reply(502, 'bad gateway').get('/search').query(true).reply(200, searchRetry);
    const body = await controller.packages({ query: 'retry' }, reply);
    expect(body.packages[0].name).toBe(searchRetry.results[0].name);
    scope.done();
  });

  it('packages: timeout -> 504', async () => {
    const searchNode = loadFixture<SearchFixture>('search.nodejs.json');
    const scope = nock(BASE).get('/search').query(true).delay(500).reply(200, searchNode);
    await controller.packages({ query: 'long' }, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(504);
    scope.done();
  });

  it('versions: 404 mapping and strict upstream path/query', async () => {
    const scope = nock(BASE).get('/packages/pkgs.missing').query((q) => q._data === 'routes/_nixhub.packages.$pkg._index').reply(404, 'not found');
    await controller.versions({ name: 'pkgs.missing' }, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(404);
    scope.done();
  });

  it('packages: cache hit; strict upstream URL', async () => {
    const searchPython = loadFixture<SearchFixture>('search.python.json');
    const scope = nock(BASE).get('/search').query((q) => q.q === 'hello' && q._data === 'routes/_nixhub.search').once().reply(200, searchPython);
    const first = await controller.packages({ query: 'hello' }, reply);
    expect(Array.isArray(first.packages)).toBe(true);
    const second = await controller.packages({ query: 'hello' }, reply);
    expect(Array.isArray(second.packages)).toBe(true);
    scope.done();
  });

  it('packages: error is not cached (500 then 200)', async () => {
    const searchFlip = loadFixture<SearchFixture>('search.nodejs.json');
    const scope = nock(BASE).get('/search').query((q) => q.q === 'flip').reply(500, 'oops').get('/search').query((q) => q.q === 'flip').reply(200, searchFlip);
    await controller.packages({ query: 'flip' }, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(502);
    const second = await controller.packages({ query: 'flip' }, reply);
    expect(Array.isArray(second.packages)).toBe(true);
    scope.done();
  });

  it('packages: invalid upstream shape -> 502 bad_upstream_json', async () => {
    const searchGit = loadFixture<SearchFixture>('search.git.json');
    const mutated = JSON.parse(JSON.stringify(searchGit)) as Partial<SearchFixture>;
    mutated.results = mutated.results!.map(({ last_updated, ...rest }) => rest as any);
    const scope = nock(BASE).get('/search').query(true).reply(200, mutated as Record<string, unknown>);
    const body = await controller.packages({ query: 'git' }, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(502);
    expect(body).toMatchObject({ error: 'bad_upstream_json' });
    scope.done();
  });

  it('packages: short query returns empty without upstream', async () => {
    const res = await controller.packages({ query: 'g' }, reply);
    expect(res).toEqual({ packages: [] });
  });

  it('packages: unknown params rejected with 400', async () => {
    const scope = nock(BASE).get('/search').query(true).reply(200, { results: [] });
    await controller.packages({ query: 'git', extra: 'x' } as any, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(400);
    expect(scope.isDone()).toBe(false);
  });

  it('versions: invalid name (unsafe ident) -> 400', async () => {
    const scope = nock(BASE).get('/packages/bad/name').query(true).reply(200, {} as any);
    await controller.versions({ name: 'bad/name' }, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(400);
    expect(scope.isDone()).toBe(false);
  });

  it('versions: success mapping (unique + sorted) and cache hit', async () => {
    const packageGit = loadFixture<PackageFixture>('package.git.json');
    const upstream = {
      ...packageGit,
      releases: [
        ...packageGit.releases,
        {
          version: '2.44.0',
          commit_hash: 'abcdef12',
          platforms: packageGit.releases[0].platforms,
        },
        {
          version: '2.44.0',
          commit_hash: 'abcdef12',
          platforms: packageGit.releases[0].platforms,
        },
        {
          version: 'v2.45.0',
          commit_hash: 'abcdef13',
          platforms: packageGit.releases[0].platforms,
        },
      ],
    } satisfies PackageFixture;
    const scope = nock(BASE).get('/packages/git').query((q) => q._data === 'routes/_nixhub.packages.$pkg._index').once().reply(200, upstream);
    const b1 = await controller.versions({ name: 'git' }, reply);
    expect(b1.versions.slice(0, 3)).toEqual(['24402', '2.45.0', 'v2.45.0']);
    expect(new Set(b1.versions).size).toBe(b1.versions.length);
    const b2 = await controller.versions({ name: 'git' }, reply);
    expect(Array.isArray(b2.versions)).toBe(true);
    scope.done();
  });

  it('versions: 502 retry then success', async () => {
    const packageNode = loadFixture<PackageFixture>('package.nodejs.json');
    const scope = nock(BASE).get('/packages/htop').query(true).reply(502, 'bad gateway').get('/packages/htop').query(true).reply(200, packageNode);
    const res = await controller.versions({ name: 'htop' }, reply);
    expect(res.versions).toContain('22.2.0');
    scope.done();
  });

  it('versions: timeout -> 504', async () => {
    const packageGit = loadFixture<PackageFixture>('package.git.json');
    const scope = nock(BASE).get('/packages/curl').query(true).delay(500).reply(200, packageGit);
    await controller.versions({ name: 'curl' }, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(504);
    scope.done();
  });

  it('versions: invalid upstream data -> 502 bad_upstream_json', async () => {
    const packageNode = loadFixture<PackageFixture>('package.nodejs.json');
    const mutated = JSON.parse(JSON.stringify(packageNode)) as PackageFixture;
    mutated.releases[0].commit_hash = 'not-hex';
    const scope = nock(BASE).get('/packages/nodejs').query(true).reply(200, mutated);
    const body = await controller.versions({ name: 'nodejs' }, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(502);
    expect(body).toMatchObject({ error: 'bad_upstream_json' });
    scope.done();
  });

  it('resolve: success with platform preference and fields', async () => {
    const packageNode = loadFixture<PackageFixture>('package.nodejs.json');
    const scope = nock(BASE).get('/packages/nodejs').query((q) => q._data === 'routes/_nixhub.packages.$pkg._index').reply(200, packageNode);
    const body = await controller.resolve({ name: 'nodejs', version: '22.2.0' }, reply);
    expect(body).toEqual({ name: 'nodejs', version: '22.2.0', commitHash: '1a2b3c4d5e6f7890', attributePath: 'nodejs' });
    scope.done();
  });

  it('resolve: release not found -> 404', async () => {
    const packageNode = loadFixture<PackageFixture>('package.nodejs.json');
    const scope = nock(BASE).get('/packages/nodejs').query(true).reply(200, packageNode);
    await controller.resolve({ name: 'nodejs', version: '9.9.9' }, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(404);
    scope.done();
  });

  it('resolve: missing attribute path -> 502', async () => {
    const packageNode = loadFixture<PackageFixture>('package.nodejs.json');
    const mutated = JSON.parse(JSON.stringify(packageNode)) as PackageFixture;
    mutated.releases = [
      {
        version: '99.1.0',
        commit_hash: 'abcdef9',
        platforms: [{ system: 'x86_64-linux' }],
      },
    ];
    const scope = nock(BASE).get('/packages/nodejs').query(true).reply(200, mutated);
    const body = await controller.resolve({ name: 'nodejs', version: '99.1.0' }, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(502);
    expect(body).toMatchObject({ error: 'missing_attribute_path' });
    scope.done();
  });

  it('resolve: missing commit hash -> 502', async () => {
    const packageNode = loadFixture<PackageFixture>('package.nodejs.json');
    const mutated = JSON.parse(JSON.stringify(packageNode)) as PackageFixture;
    mutated.releases = [
      {
        version: '77.1.0',
        platforms: [{ system: 'x86_64-linux', attribute_path: 'nodejs' }],
      },
    ];
    const scope = nock(BASE).get('/packages/nodejs').query(true).reply(200, mutated);
    const body = await controller.resolve({ name: 'nodejs', version: '77.1.0' }, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(502);
    expect(body).toMatchObject({ error: 'missing_commit_hash' });
    scope.done();
  });

  it('resolve: invalid upstream data -> 502 bad_upstream_json', async () => {
    const packageNode = loadFixture<PackageFixture>('package.nodejs.json');
    const mutated = JSON.parse(JSON.stringify(packageNode)) as PackageFixture;
    mutated.releases = [
      {
        version: '1.0.0',
        commit_hash: 'not-hex',
        platforms: [{ system: 'x86_64-linux', attribute_path: 'nodejs' }],
      },
    ];
    const scope = nock(BASE).get('/packages/nodejs').query(true).reply(200, mutated);
    const body = await controller.resolve({ name: 'nodejs', version: '1.0.0' }, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(502);
    expect(body).toMatchObject({ error: 'bad_upstream_json' });
    scope.done();
  });

  it('resolve: timeout -> 504', async () => {
    const packageNode = loadFixture<PackageFixture>('package.nodejs.json');
    const scope = nock(BASE).get('/packages/nodejs').query(true).delay(500).reply(200, packageNode);
    await controller.resolve({ name: 'nodejs', version: '22.2.0' }, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(504);
    scope.done();
  });
});
