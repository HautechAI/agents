import { describe, it, expect } from 'vitest';
// Import helpers re-exported for tests
import { __test_only__ } from '../ReusableForm';

describe('legacy mapping helpers', () => {
  it('maps legacy env map and envRefs to unified env array', () => {
    const input = {
      env: { A: '1', B: '2' },
      envRefs: { C: { source: 'vault', mount: 'secret', path: 'p', key: 'k' } },
    } as Record<string, unknown>;
    const out = __test_only__.mapLegacyToUnified(input) as any;
    expect(Array.isArray(out.env)).toBe(true);
    const envArr = out.env as Array<{ key: string; value: string; source?: string }>;
    // A,B first as static, then C as vault
    expect(envArr.find((e) => e.key === 'A')?.value).toBe('1');
    expect(envArr.find((e) => e.key === 'B')?.value).toBe('2');
    expect(envArr.find((e) => e.key === 'C')?.source).toBe('vault');
    expect(out.envRefs).toBeUndefined();
  });

  it('maps legacy authRef.vault to token and strips authRef', () => {
    const input = { authRef: { source: 'vault', mount: 'secret', path: 'github', key: 'GH_TOKEN' } } as Record<string, unknown>;
    const out = __test_only__.mapLegacyToUnified(input) as any;
    expect(out.token).toBeTruthy();
    expect(out.token.value).toBe('secret/github/GH_TOKEN');
    expect(out.token.source).toBe('vault');
    expect(out.authRef).toBeUndefined();
  });

  it('stripLegacy removes envRefs and authRef on submit', () => {
    const input = { envRefs: { FOO: { source: 'vault', path: 'p', key: 'v' } }, authRef: { source: 'env', envVar: 'GH_TOKEN' }, other: 1 };
    const out = __test_only__.stripLegacy(input);
    expect('envRefs' in out).toBe(false);
    expect('authRef' in out).toBe(false);
    expect((out as any).other).toBe(1);
  });
});
