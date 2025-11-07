import type { SecretEntry, SecretKey } from './types';

export function unionWithPresence(required: SecretKey[], available: SecretKey[]): SecretEntry[] {
  const reqSet = new Set(required.map((r) => `${r.mount}::${r.path}::${r.key}`));
  const byId = new Map<string, SecretEntry>();

  for (const a of available) {
    const id = `${a.mount}::${a.path}::${a.key}`;
    byId.set(id, { ...a, required: reqSet.has(id), present: true });
  }
  for (const r of required) {
    const id = `${r.mount}::${r.path}::${r.key}`;
    if (byId.has(id)) {
      // already marked present; ensure required flag on existing entry
      const e = byId.get(id)!;
      if (!e.required) byId.set(id, { ...e, required: true });
    } else {
      byId.set(id, { ...r, required: true, present: false });
    }
  }

  return Array.from(byId.values());
}

