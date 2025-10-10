<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 532949b (refactor(#113): batch Vault lookups; share parseVaultRef; tighten types; UI fixes\n\n- Batch env and envRefs vault resolutions with Promise.all.\n- Extract shared parseVaultRef in server utils and reuse.\n- Tighten Zod types and remove any casts where feasible.\n- UI: fix duplicate key detection and unique datalist ids.\n- Extend tests for token fallbacks, legacy compatibility, and error paths.)
import { describe, it, expect } from 'vitest';
import { parseVaultRef } from '../utils/refs';
import { describe, it, expect, vi } from 'vitest';
import { ContainerProviderEntity } from '../entities/containerProvider.entity';

// Minimal fakes
class FakeContainerService {
  async findContainerByLabels() { return undefined; }
  async start(opts: any) { return { id: 'c', exec: async () => ({ exitCode: 0 }), ...opts }; }
}
class FakeVault { isEnabled() { return true; } async getSecret() { return 'VAL'; } }
<<<<<<< HEAD
=======
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerProviderEntity, parseVaultRef } from '../entities/containerProvider.entity';
>>>>>>> 42b54f2 (feat(config,#113): unify env and token references with source-aware fields)
=======
>>>>>>> 532949b (refactor(#113): batch Vault lookups; share parseVaultRef; tighten types; UI fixes\n\n- Batch env and envRefs vault resolutions with Promise.all.\n- Extract shared parseVaultRef in server utils and reuse.\n- Tighten Zod types and remove any casts where feasible.\n- UI: fix duplicate key detection and unique datalist ids.\n- Extend tests for token fallbacks, legacy compatibility, and error paths.)

describe('ContainerProviderEntity parseVaultRef', () => {
  it('parses valid refs', () => {
    expect(parseVaultRef('secret/github/GH_TOKEN')).toEqual({ mount: 'secret', path: 'github', key: 'GH_TOKEN' });
    expect(parseVaultRef('a/b/c/d')).toEqual({ mount: 'a', path: 'b/c', key: 'd' });
  });
  it('rejects invalid refs', () => {
    expect(() => parseVaultRef('')).toThrow();
    expect(() => parseVaultRef('/a/b')).toThrow();
    expect(() => parseVaultRef('a/b')).toThrow();
  });
<<<<<<< HEAD
<<<<<<< HEAD

  it('merges env array and resolves vault entries', async () => {
    const svc = new FakeContainerService() as any;
    const vault = new FakeVault() as any;
    const ent = new ContainerProviderEntity(svc, vault, {}, () => ({}));
    ent.setConfig({ env: [ { key: 'A', value: 'x' }, { key: 'B', value: 'secret/path/key', source: 'vault' } ] });
    const container: any = await ent.provide('t');
    expect(container.env.A).toBe('x');
    expect(container.env.B).toBe('VAL');
  });
});
=======
});

>>>>>>> 42b54f2 (feat(config,#113): unify env and token references with source-aware fields)
=======

  it('merges env array and resolves vault entries', async () => {
    const svc = new FakeContainerService() as any;
    const vault = new FakeVault() as any;
    const ent = new ContainerProviderEntity(svc, vault, {}, () => ({}));
    ent.setConfig({ env: [ { key: 'A', value: 'x' }, { key: 'B', value: 'secret/path/key', source: 'vault' } ] });
    const container: any = await ent.provide('t');
    expect(container.env.A).toBe('x');
    expect(container.env.B).toBe('VAL');
  });
});
>>>>>>> 532949b (refactor(#113): batch Vault lookups; share parseVaultRef; tighten types; UI fixes\n\n- Batch env and envRefs vault resolutions with Promise.all.\n- Extract shared parseVaultRef in server utils and reuse.\n- Tighten Zod types and remove any casts where feasible.\n- UI: fix duplicate key detection and unique datalist ids.\n- Extend tests for token fallbacks, legacy compatibility, and error paths.)
