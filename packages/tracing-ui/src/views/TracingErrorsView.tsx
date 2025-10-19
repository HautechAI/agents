import React, { useEffect, useState } from 'react';
import { TimeRangeSelector, defaultLast6h } from '../components/TimeRangeSelector';
import { fetchErrorsByTool, ErrorsByToolItem } from '../services/api';

export interface TracingErrorsViewProps {
  basePaths?: { errorsTools?: string; toolErrors?: string };
  onNavigate?: (to: { type: 'toolErrors'; label: string; range: { from: string; to: string } }) => void;
}

export function TracingErrorsView({ basePaths, onNavigate }: TracingErrorsViewProps) {
  const [range, setRange] = useState(defaultLast6h());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ErrorsByToolItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    fetchErrorsByTool(range, { limit: 50 }).then((res) => { if (!cancelled) setItems(res.items); })
      .catch((e) => { if (!cancelled) setError(e.message || 'error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  const toHref = (label: string) => {
    const enc = encodeURIComponent(label);
    const from = encodeURIComponent(range.from);
    const to = encodeURIComponent(range.to);
    const base = basePaths?.toolErrors || '#/errors/tools';
    return `${base}/${enc}?from=${from}&to=${to}`;
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Errors by Tool</h1>
        <TimeRangeSelector value={range} onChange={setRange} />
      </div>
      {loading && <div style={{ paddingTop: 16 }} data-testid="obsui-errors-loading">Loading...</div>}
      {error && <div style={{ paddingTop: 16, color: 'red' }} data-testid="obsui-errors-error">Error: {error}</div>}
      {!loading && !error && items.length === 0 && <div style={{ paddingTop: 16 }} data-testid="obsui-errors-empty">No data in selected range.</div>}
      {!loading && !error && items.length > 0 && (
        <table data-testid="obsui-errors-table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th>Tool Label</th>
              <th>Error Count</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.label} data-testid="obsui-errors-row" data-label={it.label} style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                  onClick={(e) => { e.preventDefault(); onNavigate?.({ type: 'toolErrors', label: it.label, range }); }}>
                <td>
                  <a href={toHref(it.label)} onClick={(e) => { if (onNavigate) { e.preventDefault(); onNavigate({ type: 'toolErrors', label: it.label, range }); } }}>{it.label}</a>
                </td>
                <td>{it.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

