import nock from 'nock';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// Avoid Nest TestingModule; instantiate controller with DI stubs
import { NixController } from '../src/infra/ncps/nix.controller';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import type { LoggerService } from '../src/core/services/logger.service';
import type { FastifyReply } from 'fastify';

const BASE = 'https://www.nixhub.io';

const BASE_CONFIG = {
  llmProvider: 'openai',
  githubAppId: 'x',
  githubAppPrivateKey: 'x',
  githubInstallationId: 'x',
  githubToken: 'x',
  mongodbUrl: 'x',
  agentsDatabaseUrl: 'postgres://localhost:5432/agents',
  graphStore: 'mongo',
  graphRepoPath: './data/graph',
  graphBranch: 'graph-state',
  dockerMirrorUrl: 'http://registry-mirror:5000',
  nixAllowedChannels: 'nixpkgs-unstable',
  nixHttpTimeoutMs: String(200),
  nixCacheTtlMs: String(5 * 60_000),
  nixCacheMax: String(500),
  mcpToolsStaleTimeoutMs: '0',
  ncpsEnabled: 'false',
  ncpsUrl: 'http://ncps:8501',
  ncpsRefreshIntervalMs: '0',
} as const;

const createLoggerStub = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
});

const createReplyStub = (): FastifyReply => {
  const stub: Partial<FastifyReply> = {};
  stub.code = vi.fn(() => stub as FastifyReply) as any;
  stub.header = vi.fn(() => stub as FastifyReply) as any;
  return stub as FastifyReply;
};

describe('nix controller', () => {
  let controller: NixController;
  let reply: FastifyReply;
  let loggerStub: ReturnType<typeof createLoggerStub>;
  beforeEach(() => {
    const cfg = new ConfigService().init(configSchema.parse(BASE_CONFIG));
    loggerStub = createLoggerStub();
    controller = new NixController(cfg, loggerStub as unknown as LoggerService);
    reply = createReplyStub();
  });
  afterEach(() => nock.cleanAll());

  it('packages: success mapping and strict upstream URL', async () => {
    const scope = nock(BASE)
      .get('/search')
      .query((q) => q.q === 'git' && q._data === 'routes/_nixhub.search')
      .reply(200, { query: 'git', total_results: 1, results: [{ name: 'git', summary: 'the fast version control system' }] });
    const body = await controller.packages({ query: 'git' }, reply);
    expect(Array.isArray(body.packages)).toBe(true);
    expect(body.packages[0].name).toBe('git');
    scope.done();
  });

  it('packages: 502 retry then success', async () => {
    const scope = nock(BASE).get('/search').query(true).reply(502, 'bad gateway').get('/search').query(true).reply(200, { query: 'retry', total_results: 1, results: [{ name: 'ret', summary: 'pkg' }] });
    const body = await controller.packages({ query: 'retry' }, reply);
    expect(body.packages[0].name).toBe('ret');
    scope.done();
  });

  it('packages: timeout -> 504', async () => {
    const scope = nock(BASE).get('/search').query(true).delay(500).reply(200, { query: 'long', total_results: 0, results: [] });
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
    const scope = nock(BASE).get('/search').query((q) => q.q === 'hello' && q._data === 'routes/_nixhub.search').once().reply(200, { query: 'hello', total_results: 1, results: [{ name: 'hello', summary: 'hello pkg' }] });
    const first = await controller.packages({ query: 'hello' }, reply);
    expect(Array.isArray(first.packages)).toBe(true);
    const second = await controller.packages({ query: 'hello' }, reply);
    expect(Array.isArray(second.packages)).toBe(true);
    scope.done();
  });

  it('packages: error is not cached (500 then 200)', async () => {
    const scope = nock(BASE).get('/search').query((q) => q.q === 'flip').reply(500, 'oops').get('/search').query((q) => q.q === 'flip').reply(200, { query: 'flip', total_results: 1, results: [{ name: 'flip', summary: 'flip pkg' }] });
    await controller.packages({ query: 'flip' }, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(502);
    const second = await controller.packages({ query: 'flip' }, reply);
    expect(Array.isArray(second.packages)).toBe(true);
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
    const scope = nock(BASE).get('/packages/git').query((q) => q._data === 'routes/_nixhub.packages.$pkg._index').once().reply(200, { name: 'git', releases: [{ version: '2.43.1' }, { version: '2.44.0' }, { version: '2.44.0' }, { version: 'v2.45.0' }] });
    const b1 = await controller.versions({ name: 'git' }, reply);
    expect(b1.versions[0]).toBe('v2.45.0');
    const b2 = await controller.versions({ name: 'git' }, reply);
    expect(Array.isArray(b2.versions)).toBe(true);
    scope.done();
  });

  it('versions: 502 retry then success', async () => {
    const scope = nock(BASE).get('/packages/htop').query(true).reply(502, 'bad gateway').get('/packages/htop').query(true).reply(200, { name: 'htop', releases: [{ version: '3.0.0' }] });
    const res = await controller.versions({ name: 'htop' }, reply);
    expect(res.versions).toEqual(['3.0.0']);
    scope.done();
  });

  it('versions: timeout -> 504', async () => {
    const scope = nock(BASE).get('/packages/curl').query(true).delay(500).reply(200, { name: 'curl', releases: [] });
    await controller.versions({ name: 'curl' }, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(504);
    scope.done();
  });

  it('resolve: success with platform preference and fields', async () => {
    const scope = nock(BASE).get('/packages/htop').query((q) => q._data === 'routes/_nixhub.packages.$pkg._index').reply(200, {
      name: 'htop',
      releases: [
        { version: '1.0.0', commit_hash: 'old', platforms: [{ system: 'x86_64-darwin', attribute_path: 'htop' }] },
        { version: '1.2.3', commit_hash: 'abcd1234', platforms: [{ system: 'aarch64-linux', attribute_path: 'a.htop' }, { system: 'x86_64-linux', attribute_path: 'x.htop' }] },
      ],
    });
    const body = await controller.resolve({ name: 'htop', version: '1.2.3' }, reply);
    expect(body).toEqual({ name: 'htop', version: '1.2.3', commitHash: 'abcd1234', attributePath: 'x.htop' });
    scope.done();
  });

  it('resolve: release not found -> 404', async () => {
    const scope = nock(BASE).get('/packages/abc').query(true).reply(200, { name: 'abc', releases: [{ version: '0.1.0', commit_hash: 'x', platforms: [] }] });
    await controller.resolve({ name: 'abc', version: '9.9.9' }, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(404);
    scope.done();
  });

  it('resolve: missing attribute path -> 502', async () => {
    const scope = nock(BASE).get('/packages/noattr').query(true).reply(200, { name: 'noattr', releases: [{ version: '1.0.0', commit_hash: 'r1', platforms: [{ system: 'x86_64-linux' }] }] });
    await controller.resolve({ name: 'noattr', version: '1.0.0' }, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(502);
    scope.done();
  });

  it('resolve: missing commit hash -> 502', async () => {
    const scope = nock(BASE).get('/packages/nohash').query(true).reply(200, { name: 'nohash', releases: [{ version: '1.0.0', platforms: [{ system: 'x86_64-linux', attribute_path: 'x' }] }] });
    await controller.resolve({ name: 'nohash', version: '1.0.0' }, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(502);
    scope.done();
  });

  it('resolve: timeout -> 504', async () => {
    const scope = nock(BASE).get('/packages/slow').query(true).delay(500).reply(200, { name: 'slow', releases: [{ version: '1.0.0', commit_hash: 'x', platforms: [{ system: 'x86_64-linux', attribute_path: 'x' }] }] });
    await controller.resolve({ name: 'slow', version: '1.0.0' }, reply);
    expect((reply.code as any).mock.calls[0][0]).toBe(504);
    scope.done();
  });

  it('resolve: nodejs debug logging emits release subset when enabled', async () => {
    const cfg = new ConfigService().init(configSchema.parse({ ...BASE_CONFIG, nixhubDebugLog: '1' }));
    const debugLogger = createLoggerStub();
    const nodeController = new NixController(cfg, debugLogger as unknown as LoggerService);
    const nodeReply = createReplyStub();
    const scope = nock(BASE)
      .get('/packages/nodejs')
      .query((q) => q._data === 'routes/_nixhub.packages.$pkg._index')
      .once()
      .reply(200, {
        name: 'nodejs',
        releases: [
          {
            version: '24.11.0',
            commit_hash: 'abcd2411',
            platforms: [
              { system: 'x86_64-linux', attribute_path: 'legacy.nodejs_24_11' },
              { system: 'aarch64-linux', attribute_path: 'nodejs-24_11.aarch64' },
            ],
          },
          {
            version: '24.10.0',
            commit_hash: 'abcd2410',
            platforms: [
              { system: 'x86_64-linux', attribute_path: 'legacy.nodejs_24_10' },
              { system: 'aarch64-linux', attribute_path: 'nodejs-24_10.aarch64' },
            ],
          },
        ],
      });

    await nodeController.resolve({ name: 'nodejs', version: '24.11.0' }, nodeReply);
    await nodeController.resolve({ name: 'nodejs', version: '24.10.0' }, nodeReply);

    expect(debugLogger.info).toHaveBeenCalledTimes(2);
    const infoMock = debugLogger.info as ReturnType<typeof vi.fn>;
    const firstCall = infoMock.mock.calls[0];
    const secondCall = infoMock.mock.calls[1];
    expect(firstCall[0]).toBe('NixHub nodejs upstream releases');
    expect(secondCall[0]).toBe('NixHub nodejs upstream releases');
    expect(firstCall[1]).toMatchObject({
      requestedVersion: '24.11.0',
      releases: [
        expect.objectContaining({
          version: '24.11.0',
          commit_hash: 'abcd2411',
          platforms: expect.arrayContaining([
            expect.objectContaining({ attribute_path: 'legacy.nodejs_24_11' }),
            expect.objectContaining({ attribute_path: 'nodejs-24_11.aarch64' }),
          ]),
        }),
      ],
    });
    expect(secondCall[1]).toMatchObject({
      requestedVersion: '24.10.0',
      releases: [
        expect.objectContaining({
          version: '24.10.0',
          commit_hash: 'abcd2410',
          platforms: expect.arrayContaining([
            expect.objectContaining({ attribute_path: 'legacy.nodejs_24_10' }),
          ]),
        }),
      ],
    });

    scope.done();
  });
});
