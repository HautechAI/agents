import { describe, it, expect } from 'vitest';
import { buildGithubConfigFromEnv } from '../src/infra/github/github.config';

const withEnv = (env: Record<string, string | undefined>, fn: () => void) => {
  const prev = { ...process.env };
  try {
    Object.keys(env).forEach((k) => {
      const v = env[k];
      if (v === undefined) delete (process.env as Record<string, string>)[k];
      else (process.env as Record<string, string>)[k] = v;
    });
    fn();
  } finally {
    process.env = prev;
  }
};

describe('github.config buildGithubConfigFromEnv', () => {
  it('no env => enabled=false', () => {
    withEnv({ GITHUB_APP_ID: undefined, GITHUB_APP_PRIVATE_KEY: undefined, GITHUB_INSTALLATION_ID: undefined, GH_TOKEN: undefined }, () => {
      const cfg = buildGithubConfigFromEnv();
      expect(cfg.enabled).toBe(false);
      expect(cfg.app).toBeUndefined();
      expect(cfg.token).toBeUndefined();
    });
  });

  it('token-only => enabled=true', () => {
    withEnv({ GH_TOKEN: 'tkn', GITHUB_APP_ID: undefined, GITHUB_APP_PRIVATE_KEY: undefined, GITHUB_INSTALLATION_ID: undefined }, () => {
      const cfg = buildGithubConfigFromEnv();
      expect(cfg.enabled).toBe(true);
      expect(cfg.token).toBe('tkn');
      expect(cfg.app).toBeUndefined();
    });
  });

  it('app-only => enabled=true', () => {
    withEnv({ GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: 'k', GITHUB_INSTALLATION_ID: 'i', GH_TOKEN: undefined }, () => {
      const cfg = buildGithubConfigFromEnv();
      expect(cfg.enabled).toBe(true);
      expect(cfg.app?.appId).toBe('1');
      expect(cfg.app?.privateKey).toBe('k');
      expect(cfg.app?.installationId).toBe('i');
      expect(cfg.token).toBeUndefined();
    });
  });
});

