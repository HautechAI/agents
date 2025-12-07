import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from 'vitest';
import nock from 'nock';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { LiteLLMProvisioner } from '../src/llm/provisioners/litellm.provisioner';
import { LiteLLMTokenStore } from '../src/llm/provisioners/litellm.token-store';
import { ConfigService, configSchema } from '../src/core/services/config.service';

const BASE_URL = 'http://litellm.local';

function createConfig(): ConfigService {
  const parsed = configSchema.parse({
    agentsDatabaseUrl: 'postgres://user:pass@localhost:5432/agents',
    llmProvider: 'litellm',
    litellmBaseUrl: BASE_URL,
    litellmMasterKey: 'master-key',
  });
  return new ConfigService().init(parsed);
}

describe('LiteLLMProvisioner', () => {
  let tempDir: string;
  let store: LiteLLMTokenStore;
  let config: ConfigService;

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'litellm-'));
    store = new LiteLLMTokenStore({
      paths: {
        tokenPath: join(tempDir, 'service_token.json'),
        lockPath: join(tempDir, 'service_token.lock'),
      },
    });
    config = createConfig();
    nock.cleanAll();
  });

  afterEach(async () => {
    nock.cleanAll();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates a new service token when none exists', async () => {
    const provisioner = new LiteLLMProvisioner(config, {
      tokenStore: store,
      now: () => new Date('2025-01-01T00:00:00Z'),
    });

    const scope = nock(BASE_URL)
      .post('/key/delete', { key_aliases: ['agents-service'] })
      .reply(200, {})
      .get('/team/info')
      .query({ team_alias: 'agents-service' })
      .reply(404, {})
      .post('/team/new', { team_alias: 'agents-service' })
      .reply(200, { team_id: 'team-001', team_alias: 'agents-service' })
      .post('/key/generate', {
        key_alias: 'agents-service',
        models: ['all-team-models'],
        team_id: 'team-001',
      })
      .reply(200, { key: 'sk-service', id: 'key-001', team_id: 'team-001' });

    const result = await (provisioner as any).fetchOrCreateKeysInternal();

    expect(result.apiKey).toBe('sk-service');
    expect(result.baseUrl).toBe(`${BASE_URL}/v1`);
    const stored = await store.read();
    expect(stored).toEqual({
      token: 'sk-service',
      alias: 'agents-service',
      team_id: 'team-001',
      base_url: BASE_URL,
      created_at: '2025-01-01T00:00:00.000Z',
    });
    expect(scope.isDone()).toBe(true);
  });

  it('reuses an existing valid token', async () => {
    await store.write({
      token: 'sk-existing',
      alias: 'agents-service',
      team_id: 'team-001',
      base_url: BASE_URL,
      created_at: '2025-01-01T00:00:00.000Z',
    });
    const provisioner = new LiteLLMProvisioner(config, { tokenStore: store });

    const scope = nock(BASE_URL)
      .get('/key/info')
      .query({ key: 'sk-existing' })
      .reply(200, { key: 'sk-existing' });

    const result = await (provisioner as any).fetchOrCreateKeysInternal();

    expect(result.apiKey).toBe('sk-existing');
    expect(result.baseUrl).toBe(`${BASE_URL}/v1`);
    const stored = await store.read();
    expect(stored?.token).toBe('sk-existing');
    expect(scope.isDone()).toBe(true);
  });

  it('regenerates token when validation fails and cleans up old alias', async () => {
    await store.write({
      token: 'sk-old',
      alias: 'agents-service',
      team_id: 'team-002',
      base_url: BASE_URL,
      created_at: '2025-01-01T00:00:00.000Z',
    });
    const provisioner = new LiteLLMProvisioner(config, {
      tokenStore: store,
      now: () => new Date('2025-01-02T00:00:00Z'),
    });

    const scope = nock(BASE_URL)
      .get('/key/info')
      .query({ key: 'sk-old' })
      .times(2)
      .reply(401, {})
      .post('/key/delete', { key_aliases: ['agents-service'] })
      .reply(200, {})
      .get('/team/info')
      .query({ team_id: 'team-002' })
      .reply(404, {})
      .get('/team/info')
      .query({ team_alias: 'agents-service' })
      .reply(404, {})
      .post('/team/new', { team_alias: 'agents-service' })
      .reply(200, { team_id: 'team-002', team_alias: 'agents-service' })
      .post('/key/generate', {
        key_alias: 'agents-service',
        models: ['all-team-models'],
        team_id: 'team-002',
      })
      .reply(200, { key: 'sk-new', id: 'key-002', team_id: 'team-002' })
      .post('/key/delete', { keys: ['sk-old'] })
      .reply(200, {});

    const result = await (provisioner as any).fetchOrCreateKeysInternal();

    expect(result.apiKey).toBe('sk-new');
    expect(result.baseUrl).toBe(`${BASE_URL}/v1`);
    const stored = await store.read();
    expect(stored).toEqual({
      token: 'sk-new',
      alias: 'agents-service',
      team_id: 'team-002',
      base_url: BASE_URL,
      created_at: '2025-01-02T00:00:00.000Z',
    });
    expect(scope.isDone()).toBe(true);
  });

  it('prevents duplicate generation under concurrent calls', async () => {
    const provisioner = new LiteLLMProvisioner(config, {
      tokenStore: store,
      now: () => new Date('2025-01-03T00:00:00Z'),
    });

    const scope = nock(BASE_URL)
      .post('/key/delete', { key_aliases: ['agents-service'] })
      .reply(200, {})
      .get('/team/info')
      .query({ team_alias: 'agents-service' })
      .reply(404, {})
      .post('/team/new', { team_alias: 'agents-service' })
      .reply(200, { team_id: 'team-003', team_alias: 'agents-service' })
      .post('/key/generate', {
        key_alias: 'agents-service',
        models: ['all-team-models'],
        team_id: 'team-003',
      })
      .reply(200, { key: 'sk-concurrent', id: 'key-003', team_id: 'team-003' })
      .get('/key/info')
      .query({ key: 'sk-concurrent' })
      .reply(200, { key: 'sk-concurrent' });

    const [first, second] = await Promise.all([
      (provisioner as any).fetchOrCreateKeysInternal(),
      (provisioner as any).fetchOrCreateKeysInternal(),
    ]);

    expect(first.apiKey).toBe('sk-concurrent');
    expect(second.apiKey).toBe('sk-concurrent');
    const stored = await store.read();
    expect(stored?.token).toBe('sk-concurrent');
    expect(scope.isDone()).toBe(true);
  });
});
