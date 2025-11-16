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

const ROLE_TEXT_COLORS: Record<ContextItem['role'], string> = {
  system: 'text-gray-900',
  user: 'text-emerald-600',
  assistant: 'text-sky-600',
  tool: 'text-amber-600',
  memory: 'text-purple-600',
  summary: 'text-indigo-600',
  other: 'text-gray-600',
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

      {items.map((item) => {
        const metadataText = metadataById.get(item.id);
        const textContent = toPlainText(item.contentText, item.contentJson);
        const roleTextClass = ROLE_TEXT_COLORS[item.role] ?? 'text-gray-600';
        return (
          <article key={item.id} className="space-y-2 text-[11px] text-gray-800">
            <header className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              <span className={`normal-case ${roleTextClass}`}>{item.role}</span>
              <span className="normal-case text-gray-600">{new Date(item.createdAt).toLocaleString()}</span>
              <span className="normal-case text-gray-500">{formatBytes(item.sizeBytes)}</span>
            </header>
            {textContent ? <div className="content-wrap text-gray-800">{textContent}</div> : null}
            {metadataText ? (
              <div className="space-y-1 text-[10px] text-gray-500">
                <div className="uppercase tracking-wide">Metadata</div>
                <pre className="content-wrap text-[11px] text-gray-700">{metadataText}</pre>
              </div>
            ) : null}
          </article>
        );
      })}

      {isInitialLoading && <div className="text-[11px] text-gray-500">Loading context…</div>}
      {!!error && !isInitialLoading && <div className="text-[11px] text-red-600">Failed to load context items</div>}
      {isFetching && !isInitialLoading && <div className="text-[11px] text-gray-500">Loading…</div>}
      {!error && !isFetching && !isInitialLoading && items.length === 0 && displayedCount > 0 && (
        <div className="text-[11px] text-gray-500">No context items available.</div>
      )}
    </div>
  );
}
