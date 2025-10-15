import { useMemo } from 'react';
import { collectVaultRefs } from './collect';
import { parseVaultRef, isValidVaultRef } from './parse';
import { useVaultKeyExistence } from './useVaultKeyExistence';

export function useNodeVaultStatus(config?: Record<string, unknown>) {
  const refs = useMemo(() => collectVaultRefs(config || {}), [config]);
  // Map each ref to a hook call; React rules of hooks require stable call order.
  const statuses = refs.map((r) => {
    if (!isValidVaultRef(r)) return 'error' as const; // invalid format
    const p = parseVaultRef(r);
    const { status } = useVaultKeyExistence(p.mount, p.path, p.key);
    return status;
  });

  const agg = useMemo(() => {
    const total = refs.length;
    let exists = 0,
      missing = 0,
      error = 0,
      disabled = 0;
    for (const s of statuses) {
      if (s === 'exists') exists++;
      else if (s === 'missing') missing++;
      else if (s === 'error') error++;
      else if (s === 'disabled' || s === 'idle' || s === 'loading') disabled++;
    }
    return { total, exists, missing, error, disabled };
  }, [statuses, refs.length]);

  return agg;
}

