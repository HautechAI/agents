import type { PersistedGraph } from '@agyn/shared';
import { collectVaultRefs } from './collect';
import { parseVaultRef, isValidVaultRef } from './parse';
import type { SecretKey } from './types';

export function computeRequiredKeys(graph: PersistedGraph): SecretKey[] {
  const uniq = new Set<string>();
  const out: SecretKey[] = [];
  for (const n of graph.nodes || []) {
    const refs = collectVaultRefs((n as { config?: Record<string, unknown> }).config || {});
    for (const r of refs) {
      if (!isValidVaultRef(r)) continue;
      const p = parseVaultRef(r);
      if (!(p.mount && p.path && p.key)) continue;
      const id = `${p.mount}::${p.path}::${p.key}`;
      if (uniq.has(id)) continue;
      uniq.add(id);
      out.push({ mount: p.mount, path: p.path, key: p.key });
    }
  }
  return out;
}

