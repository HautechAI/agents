import { useMemo } from 'react';
import { useContextItems } from '@/api/hooks/contextItems';
import type { ContextItem } from '@/api/types/agents';

type LLMContextViewerProps = {
  ids: readonly string[];
};

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size % 1 === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function toPlainText(content: ContextItem['contentText'], fallback: ContextItem['contentJson']): string {
  if (typeof content === 'string' && content.trim().length > 0) return content;
  if (fallback === null || fallback === undefined) return '';
  try {
    return JSON.stringify(fallback, null, 2);
  } catch (_err) {
    return String(fallback);
  }
}

function hasMetadata(meta: ContextItem['metadata']): boolean {
  if (!meta || typeof meta !== 'object') return false;
  return Object.keys(meta as Record<string, unknown>).length > 0;
}

function renderMetadata(meta: ContextItem['metadata']) {
  if (!hasMetadata(meta)) return null;
  try {
    return JSON.stringify(meta, null, 2);
  } catch (_err) {
    return String(meta);
  }
}

const ROLE_COLORS: Record<ContextItem['role'], string> = {
  system: 'bg-gray-900 text-white',
  user: 'bg-emerald-600 text-white',
  assistant: 'bg-sky-600 text-white',
  tool: 'bg-amber-600 text-white',
  memory: 'bg-purple-600 text-white',
  summary: 'bg-indigo-600 text-white',
  other: 'bg-gray-500 text-white',
};

export function LLMContextViewer({ ids }: LLMContextViewerProps) {
  const { items, hasMore, isInitialLoading, isFetching, error, loadMore, total, targetCount } = useContextItems(ids, {
    initialCount: 10,
  });

  const emptyState = ids.length === 0;
  const metadataById = useMemo(() => {
    return new Map(items.map((item) => [item.id, renderMetadata(item.metadata)]));
  }, [items]);
  const displayedCount = useMemo(() => Math.min(targetCount, total), [targetCount, total]);

  if (emptyState) {
    return <div className="text-[11px] text-gray-500">No context items</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {items.map((item) => {
        const metadataText = metadataById.get(item.id);
        const textContent = toPlainText(item.contentText, item.contentJson);
        const roleColor = ROLE_COLORS[item.role] ?? 'bg-gray-900 text-white';
        return (
          <article key={item.id} className="rounded border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-800 shadow-sm">
            <header className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-gray-500">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold normal-case ${roleColor}`}>
                {item.role}
              </span>
              <span className="normal-case text-gray-600">{new Date(item.createdAt).toLocaleString()}</span>
              <span className="normal-case text-gray-500">{formatBytes(item.sizeBytes)}</span>
            </header>
            {textContent ? <div className="mt-2 content-wrap text-gray-800">{textContent}</div> : null}
            {metadataText ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-gray-500">Metadata</summary>
                <pre className="mt-1 content-wrap text-gray-700">{metadataText}</pre>
              </details>
            ) : null}
          </article>
        );
      })}

      {isInitialLoading && <div className="text-[11px] text-gray-500">Loading context…</div>}
      {error && !isInitialLoading && <div className="text-[11px] text-red-600">Failed to load context items</div>}
      {hasMore && (
        <button
          type="button"
          className="self-start rounded border border-gray-300 bg-white px-3 py-1 text-[11px] font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={loadMore}
          disabled={isFetching}
        >
          Load older context ({displayedCount} of {total})
        </button>
      )}
      {isFetching && !isInitialLoading && <div className="text-[11px] text-gray-500">Loading…</div>}
      {!error && !isFetching && !isInitialLoading && items.length === 0 && displayedCount > 0 && (
        <div className="text-[11px] text-gray-500">No context items available.</div>
      )}
    </div>
  );
}
