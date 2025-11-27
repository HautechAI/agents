import { describe, it, expect, vi } from 'vitest';
import { EnvService, type EnvItem } from '../src/env/env.service';
import { ResolveError } from '../src/utils/references';

type ResolverResult = { output: EnvItem[]; report: { events: unknown[]; counts: Record<string, number> } };

const makeResolver = (
  handler?: (input: EnvItem[], options: { basePath?: string; strict?: boolean }) => Promise<ResolverResult>,
) => ({
  resolve: vi.fn(async (input: EnvItem[], options: { basePath?: string; strict?: boolean }) => {
    const impl =
      handler ||
      (async (value: EnvItem[]) => ({
        output: value,
        report: {
          events: [],
          counts: {
            total: Array.isArray(value) ? value.length : 0,
            resolved: Array.isArray(value) ? value.length : 0,
            unresolved: 0,
            cacheHits: 0,
            errors: 0,
          },
        },
      }));
    return impl(input, options);
  }),
});

describe('EnvService', () => {
  describe('resolveEnvItems', () => {
    it('returns map for static values', async () => {
      const resolver = makeResolver();
      const svc = new EnvService(resolver as any);
      const items = [
        { name: 'A', value: '1' },
        { name: 'B', value: '2' },
      ] satisfies EnvItem[];
      const res = await svc.resolveEnvItems(items);
      expect(res).toEqual({ A: '1', B: '2' });
      const [, opts] = resolver.resolve.mock.calls[0];
      expect(opts).toMatchObject({ basePath: '/env', strict: true });
    });

    it('resolves vault env items with strict base path metadata', async () => {
      const vaultItems = [
        { name: 'GITHUB_TOKEN', value: { kind: 'vault', mount: 'secrets', path: 'casey', key: 'github' } },
        {
          name: 'GITHUB_PERSONAL_ACCESS_TOKEN',
          value: { kind: 'vault', mount: 'secrets', path: 'casey', key: 'pat' },
        },
        { name: 'DOPPLER_TOKEN', value: { kind: 'vault', mount: 'secrets', path: 'doppler', key: 'token' } },
      ] satisfies EnvItem[];

      const resolver = makeResolver(async (input, options) => {
        expect(options).toMatchObject({ basePath: '/env', strict: true });
        expect(input.map((item) => item.name)).toEqual(vaultItems.map((item) => item.name));
        return {
          output: [
            { name: 'GITHUB_TOKEN', value: 'ghs-casey' },
            { name: 'GITHUB_PERSONAL_ACCESS_TOKEN', value: 'ghp-casey' },
            { name: 'DOPPLER_TOKEN', value: 'doppler-casey' },
          ],
          report: {
            events: input.map((_, idx) => ({ path: `/env/${idx}/value` })),
            counts: { total: 3, resolved: 3, unresolved: 0, cacheHits: 0, errors: 0 },
          },
        } satisfies ResolverResult;
      });

      const svc = new EnvService(resolver as any);
      const result = await svc.resolveEnvItems(vaultItems);
      expect(result).toEqual({
        GITHUB_TOKEN: 'ghs-casey',
        GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp-casey',
        DOPPLER_TOKEN: 'doppler-casey',
      });

      const [, opts] = resolver.resolve.mock.calls[0];
      expect(opts).toMatchObject({ basePath: '/env', strict: true });
      const { report } = await resolver.resolve.mock.results[0].value;
      expect(report.counts.resolved).toBe(3);
      expect(report.events.every((evt: { path: string }) => evt.path.startsWith('/env'))).toBe(true);
    });

    it('rejects duplicate env names', async () => {
      const resolver = makeResolver();
      const svc = new EnvService(resolver as any);
      await expect(
        svc.resolveEnvItems([
          { name: 'A', value: '1' },
          { name: 'A', value: '2' },
        ] as EnvItem[]),
      ).rejects.toMatchObject({ code: 'env_name_duplicate' });
    });

    it('maps ResolveError codes to EnvError with path metadata', async () => {
      const resolver = makeResolver();
      const err = new ResolveError('unresolved_reference', 'Secret missing', {
        path: '/env/0/value',
        source: 'secret',
      });
      resolver.resolve.mockRejectedValue(err);
      const svc = new EnvService(resolver as any);
      await expect(
        svc.resolveEnvItems([
          { name: 'A', value: { kind: 'vault', path: 'secret/app/db', key: 'PASSWORD' } },
        ] as EnvItem[]),
      ).rejects.toMatchObject({ code: 'env_reference_unresolved', details: { path: '/env/0/value' } });
    });

    it('maps permission denied errors to env_permission_denied', async () => {
      const resolver = makeResolver();
      const err = new ResolveError('permission_denied', 'Forbidden', {
        path: '/env/1/value',
        statusCode: 403,
        source: 'vault',
      });
      resolver.resolve.mockRejectedValue(err);
      const svc = new EnvService(resolver as any);
      await expect(
        svc.resolveEnvItems([
          { name: 'A', value: { kind: 'vault', path: 'secret/app/db', key: 'PASSWORD' } },
        ] as EnvItem[]),
      ).rejects.toMatchObject({ code: 'env_permission_denied' });
    });

    it('throws when resolver returns nested reference output', async () => {
      const resolver = makeResolver(async () => ({
        output: [
          { name: 'A', value: { kind: 'vault', path: 'secret/app/db', key: 'PASSWORD' } },
        ],
        report: { events: [], counts: { total: 1, resolved: 0, unresolved: 1, cacheHits: 0, errors: 0 } },
      }));
      const svc = new EnvService(resolver as any);
      await expect(
        svc.resolveEnvItems([
          { name: 'A', value: { kind: 'vault', path: 'secret/app/db', key: 'PASSWORD' } },
        ] as EnvItem[]),
      ).rejects.toMatchObject({ code: 'env_reference_unresolved' });
    });

    it('memoizes duplicate references via resolver cache hits', async () => {
      const sharedRef = { kind: 'vault', mount: 'secrets', path: 'team/shared', key: 'TOKEN' } as const;
      const resolver = makeResolver(async (input) => {
        expect(input).toHaveLength(2);
        expect(input[0].value).toBe(sharedRef);
        expect(input[1].value).toBe(sharedRef);
        return {
          output: [
            { name: input[0].name, value: 'shared-token' },
            { name: input[1].name, value: 'shared-token' },
          ],
          report: { events: [], counts: { total: 2, resolved: 2, unresolved: 0, cacheHits: 1, errors: 0 } },
        } satisfies ResolverResult;
      });

      const svc = new EnvService(resolver as any);
      const res = await svc.resolveEnvItems([
        { name: 'FIRST', value: sharedRef },
        { name: 'SECOND', value: sharedRef },
      ] satisfies EnvItem[]);

      expect(res).toEqual({ FIRST: 'shared-token', SECOND: 'shared-token' });
      expect(resolver.resolve).toHaveBeenCalledTimes(1);
      const { report } = await resolver.resolve.mock.results[0].value;
      expect(report.counts.cacheHits).toBeGreaterThanOrEqual(1);
    });
  });

  it('mergeEnv: overlay precedence and empty preservation', () => {
    const resolver = makeResolver();
    const svc = new EnvService(resolver as any);
    const base = { A: '1', B: '2' };
    const overlay = { B: '22', C: '' };
    expect(svc.mergeEnv(base, undefined)).toEqual(base);
    expect(svc.mergeEnv(undefined, overlay)).toEqual({ B: '22', C: '' });
    expect(svc.mergeEnv(base, overlay)).toEqual({ A: '1', B: '22', C: '' });
  });

  describe('resolveProviderEnv', () => {
    it('supports array items with base overlay', async () => {
      const resolver = makeResolver();
      const svc = new EnvService(resolver as any);
      vi.spyOn(svc, 'resolveEnvItems').mockResolvedValue({ A: '1', B: '2' });
      const base = { BASE: 'x' };
      const merged = await svc.resolveProviderEnv(
        [
          { name: 'A', value: '1' },
          { name: 'B', value: '2' },
        ],
        undefined,
        base,
      );
      expect(merged).toEqual({ BASE: 'x', A: '1', B: '2' });
    });

    it('supports map input', async () => {
      const resolver = makeResolver();
      const svc = new EnvService(resolver as any);
      const base = { BASE: 'x' };
      const merged = await svc.resolveProviderEnv({ A: '1', B: '2' }, undefined, base);
      expect(merged).toEqual({ BASE: 'x', A: '1', B: '2' });
    });

    it('undefined or empty returns base or undefined', async () => {
      const resolver = makeResolver();
      const svc = new EnvService(resolver as any);
      expect(await svc.resolveProviderEnv(undefined, undefined, undefined)).toBeUndefined();
      expect(await svc.resolveProviderEnv([], undefined, undefined)).toBeUndefined();
      expect(await svc.resolveProviderEnv({}, undefined, undefined)).toBeUndefined();
      expect(await svc.resolveProviderEnv(undefined, undefined, { A: '1' })).toEqual({ A: '1' });
    });

    it('base present + empty overlay => {}; no base + empty overlay => undefined', async () => {
      const resolver = makeResolver();
      const svc = new EnvService(resolver as any);
      vi.spyOn(svc, 'resolveEnvItems').mockResolvedValue({});
      vi.spyOn(svc, 'mergeEnv').mockImplementation((_base, _overlay) => ({}));
      const res1 = await svc.resolveProviderEnv([], undefined, { A: '1' });
      expect(res1).toEqual({});
      const res2 = await svc.resolveProviderEnv([], undefined, undefined);
      expect(res2).toBeUndefined();
    });

    it('rejects cfgEnvRefs usage', async () => {
      const resolver = makeResolver();
      const svc = new EnvService(resolver as any);
      await expect(svc.resolveProviderEnv([], undefined, {})).resolves.toEqual({});
      await expect(
        // @ts-expect-error simulate passing a defined cfgEnvRefs param, which should be rejected
        svc.resolveProviderEnv([], 'anything', {} as Record<string, string>),
      ).rejects.toMatchObject({ code: 'env_items_invalid' });
    });
  });
});
