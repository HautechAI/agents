import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Import after mocking config in each test to ensure evaluation uses current config

describe('apiClient base URL resolution', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function importFresh() {
    // dynamic import of the module to use current mocks
    const mod = await import('../../api/client');
    return mod;
  }

  it('uses config.apiBaseUrl', async () => {
    vi.doMock('@/config', () => ({ config: { apiBaseUrl: 'https://vite.example', tracing: {} } }), { virtual: true });
    const { getApiBase } = await importFresh();
    expect(getApiBase()).toBe('https://vite.example');
  });
});

describe('apiClient buildUrl edge cases', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function importFresh() {
    const mod = await import('../../api/client');
    return mod;
  }

  it('joins base with leading slash path', async () => {
    vi.doMock('@/config', () => ({ config: { apiBaseUrl: 'https://example.com', tracing: {} } }), { virtual: true });
    const { buildUrl } = await importFresh();
    expect(buildUrl('/api/x')).toBe('https://example.com/api/x');
  });

  it('adds leading slash when missing in path', async () => {
    vi.doMock('@/config', () => ({ config: { apiBaseUrl: 'https://example.com', tracing: {} } }), { virtual: true });
    const { buildUrl } = await importFresh();
    expect(buildUrl('api/x')).toBe('https://example.com/api/x');
  });

  it('handles base with trailing slash', async () => {
    vi.doMock('@/config', () => ({ config: { apiBaseUrl: 'https://example.com/', tracing: {} } }), { virtual: true });
    const { buildUrl } = await importFresh();
    expect(buildUrl('/api/x')).toBe('https://example.com/api/x');
  });

  it('returns relative when base is empty string', async () => {
    vi.doMock('@/config', () => ({ config: { apiBaseUrl: '', tracing: {} } }), { virtual: true });
    const { buildUrl } = await importFresh();
    expect(buildUrl('api/x')).toBe('/api/x');
  });
});
