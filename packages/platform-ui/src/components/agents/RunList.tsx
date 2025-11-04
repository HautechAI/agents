import React from 'react';

export type RunItem = { id: string; status: 'running' | 'finished' | 'terminated'; createdAt: string; updatedAt: string };

type RunListProps = {
  runs: RunItem[];
  selectedRunId?: string;
  onSelect: (id: string) => void;
};

export function RunList({ runs, selectedRunId, onSelect }: RunListProps) {
  const listRef = React.useRef<HTMLUListElement | null>(null);

  const onKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const target = e.target as HTMLElement;
    if (!listRef.current) return;
    const items = Array.from(listRef.current.querySelectorAll('[data-run-id]')) as HTMLElement[];
    const current = target.closest('[data-run-id]') as HTMLElement | null;
    const idx = current ? items.indexOf(current) : -1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = items[Math.min(idx + 1, items.length - 1)];
      next?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = items[Math.max(idx - 1, 0)];
      prev?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const el = items[idx];
      const id = el?.getAttribute('data-run-id');
      if (id) onSelect(id);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="text-sm font-medium px-2 py-1">Runs</div>
      <ul ref={listRef} role="listbox" aria-label="Runs" className="mt-1 space-y-1 overflow-auto" onKeyDown={onKeyDown}>
        {runs.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              data-run-id={r.id}
              role="option"
              aria-selected={selectedRunId === r.id}
              className={`w-full text-left px-2 py-1 rounded outline-offset-2 ${selectedRunId === r.id ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
              onClick={() => onSelect(r.id)}
            >
              <div className="text-sm truncate">{r.id.slice(0, 8)}… {r.status}</div>
              <div className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleString()}</div>
            </button>
          </li>
        ))}
        {runs.length === 0 && (
          <li className="text-sm text-gray-500 px-2 py-2" aria-live="polite">No runs</li>
        )}
      </ul>
    </div>
  );
}

