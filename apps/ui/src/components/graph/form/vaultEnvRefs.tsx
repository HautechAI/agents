import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/graph/api';

type RefItem = { source?: 'vault'; mount?: string; path?: string; key?: string; optional?: boolean };

export function VaultEnvRefs({ formData, onChange }: { formData?: Record<string, RefItem>; onChange?: (next: Record<string, RefItem>) => void }) {
  const [mounts, setMounts] = useState<string[]>([]);
  const [pathsCache, setPathsCache] = useState<Record<string, string[]>>({}); // by mount
  const [keysCache, setKeysCache] = useState<Record<string, Record<string, string[]>>>({}); // mount->path->keys

  const data = useMemo(() => ({ ...(formData || {}) }), [formData]);

  useEffect(() => {
    api.listVaultMounts().then((r) => setMounts(r.items || [])).catch(() => setMounts([]));
  }, []);

  async function ensurePaths(mount: string, prefix: string) {
    const k = mount || 'secret';
    const cache = pathsCache[k];
    if (!cache) {
      const res = await api.listVaultPaths(k, prefix);
      setPathsCache((prev) => ({ ...prev, [k]: res.items || [] }));
    }
  }
  async function ensureKeys(mount: string, path: string) {
    const m = mount || 'secret';
    const cache = keysCache[m]?.[path];
    if (!cache) {
      const res = await api.listVaultKeys(m, path);
      setKeysCache((prev) => ({ ...prev, [m]: { ...(prev[m] || {}), [path]: res.items || [] } }));
    }
  }

  function update(k: string, v: RefItem) {
    const next = { ...data, [k]: { source: 'vault', ...v } } as Record<string, RefItem>;
    onChange?.(next);
  }

  return (
    <div className="space-y-2">
      {Object.entries(data).map(([name, ref]) => (
        <div key={name} className="flex gap-2 items-center">
          <div className="w-40">
            <input className="w-full rounded border px-2 py-1 text-xs" value={name} readOnly />
          </div>
          <select
            className="rounded border px-2 py-1 text-xs"
            value={ref.mount || 'secret'}
            onChange={(e) => update(name, { ...ref, mount: e.target.value || 'secret' })}
          >
            {[ref.mount || 'secret', ...mounts.filter((m) => m !== (ref.mount || 'secret'))].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <input
            className="flex-1 rounded border px-2 py-1 text-xs"
            placeholder="path (e.g., github)"
            value={ref.path || ''}
            onFocus={() => ensurePaths(ref.mount || 'secret', ref.path || '')}
            onChange={(e) => update(name, { ...ref, path: e.target.value })}
            list={`${name}-paths`}
          />
          <datalist id={`${name}-paths`}>
            {(pathsCache[ref.mount || 'secret'] || []).map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <input
            className="w-40 rounded border px-2 py-1 text-xs"
            placeholder="key (e.g., GH_TOKEN)"
            value={ref.key || ''}
            onFocus={() => ref.path && ensureKeys(ref.mount || 'secret', ref.path)}
            onChange={(e) => update(name, { ...ref, key: e.target.value })}
            list={`${name}-keys`}
          />
          <datalist id={`${name}-keys`}>
            {(keysCache[ref.mount || 'secret']?.[ref.path || ''] || []).map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={!!ref.optional} onChange={(e) => update(name, { ...ref, optional: e.target.checked })} />
            optional
          </label>
        </div>
      ))}
      {Object.keys(data).length === 0 && <div className="text-xs text-gray-500">No Vault env refs configured</div>}
    </div>
  );
}

