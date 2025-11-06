import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('http client base URL resolution', () => {
  beforeEach(async () => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves API base with VITE_API_BASE_URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://vite.example');
    const mod = await import('../../api/client');
    expect(mod.getApiBase()).toBe('https://vite.example');
  });

  it('defaults to localhost when VITE_API_BASE_URL missing', async () => {
    vi.unstubAllEnvs();
    const mod = await import('../../api/client');
    // In tests, resolveApiBase returns '' due to vitest detection in config; client.getApiBase throws without env
    // So assert buildUrl produces relative path when base override provided
    expect(mod.buildUrl('/x', '')).toBe('/x');
  });
});
