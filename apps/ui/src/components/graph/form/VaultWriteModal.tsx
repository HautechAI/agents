import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/graph/api';
import { notifyError, notifySuccess } from '@/lib/notify';

export function VaultWriteModal({ mount, path, key, onClose }: { mount: string; path: string; key: string; onClose: (didWrite?: boolean) => void }) {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit() {
    setSubmitting(true);
    try {
      await api.writeVaultKey(mount, { path, key, value });
      await qc.invalidateQueries({ queryKey: ['vault', 'keys', mount, path] });
      notifySuccess('Secret updated');
      onClose(true);
    } catch (e: any) {
      const msg = e?.message || 'Write failed';
      notifyError(msg);
      setSubmitting(false);
    }
  }

  return (
    <div role="dialog" aria-label="vault-write-modal" aria-modal className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded shadow-lg w-[520px] max-w-[90vw] p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Edit Vault secret</h2>
          <button aria-label="Close" className="text-xs" onClick={() => onClose(false)}>
            ×
          </button>
        </div>
        <div className="text-[11px] text-muted-foreground mb-2">
          <div>
            <span className="font-mono">mount:</span> <span className="font-mono">{mount}</span>
          </div>
          <div>
            <span className="font-mono">path:</span> <span className="font-mono">{path}</span>
          </div>
          <div>
            <span className="font-mono">key:</span> <span className="font-mono">{key}</span>
          </div>
        </div>
        <label className="block text-[11px] mb-1" htmlFor="vault-value">
          Value (write-only; not read back)
        </label>
        <textarea
          id="vault-value"
          ref={ref}
          className="w-full h-32 border rounded p-2 text-xs"
          placeholder="Enter secret value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="flex items-center justify-end gap-2 mt-3">
          <button className="text-xs px-3 py-1 rounded border" onClick={() => onClose(false)} disabled={submitting}>
            Cancel
          </button>
          <button
            className="text-xs px-3 py-1 rounded bg-blue-600 text-white disabled:bg-blue-300"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

