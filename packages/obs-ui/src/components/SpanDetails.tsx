import React, { useEffect, useMemo, useState } from 'react';
import { SpanDoc, LogDoc } from '../types';
import { fetchLogs } from '../services/api';
import { spanRealtime } from '../services/socket';

export function SpanDetails({ span, spans, onSelectSpan, onClose }: { span: SpanDoc; spans: SpanDoc[]; onSelectSpan(s: SpanDoc): void; onClose(): void }) {
  const [allLogs, setAllLogs] = useState<LogDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Fetch all logs for trace; filtering done client-side for subtree view
    fetchLogs({ traceId: span.traceId, limit: 500 })
      .then(items => { if (!cancelled) setAllLogs(items.reverse()); }) // oldest first
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    const off = spanRealtime.onLog(l => {
      if (l.traceId === span.traceId) {
        setAllLogs(prev => [...prev, l]);
      }
    });
    return () => { cancelled = true; off(); };
  }, [span.spanId, span.traceId]);

  // Build quick index for parent-child relationships
  const childrenMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    spans.forEach(s => { if (s.parentSpanId) (map[s.parentSpanId] ||= []).push(s.spanId); });
    return map;
  }, [spans]);

  const subtreeSpanIds = useMemo(() => {
    const ids = new Set<string>();
    function dfs(id: string) {
      if (ids.has(id)) return;
      ids.add(id);
      const kids = childrenMap[id];
      if (kids) kids.forEach(dfs);
    }
    dfs(span.spanId);
    return ids;
  }, [span.spanId, childrenMap]);

  const filteredLogs = useMemo(() => {
    return allLogs.filter(l => !l.spanId || subtreeSpanIds.has(l.spanId));
  }, [allLogs, subtreeSpanIds]);

  // Span lookup for name in table
  const spanById = useMemo(() => Object.fromEntries(spans.map(s => [s.spanId, s])), [spans]);

  return (
    <div style={{ padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h2 style={{ margin: '0 8px 0 0' }}>{span.label}</h2>
        <button onClick={onClose} style={{ marginLeft: 'auto' }}>Back to timeline</button>
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#555' }}>{span.spanId}</div>
      <p>Status: <strong>{span.status}</strong></p>
      <p>Start: {new Date(span.startTime).toLocaleString()}</p>
      {span.endTime && <p>End: {new Date(span.endTime).toLocaleString()}</p>}
      <p>Duration: {span.endTime ? (Date.parse(span.endTime) - Date.parse(span.startTime)) + ' ms' : 'running'}</p>
      {span.parentSpanId && <p>Parent: {span.parentSpanId}</p>}
      {span.threadId && <p>Thread: {span.threadId}</p>}
      {span.nodeId && <p>Node: {span.nodeId}</p>}
      <h3>Attributes</h3>
      <pre style={{ background: '#f1f3f5', padding: 8, borderRadius: 4 }}>{JSON.stringify(span.attributes, null, 2)}</pre>
      <h3>Events</h3>
      {span.events.length === 0 && <div style={{ color: '#666' }}>No events</div>}
      {span.events.map(e => (
        <div key={e.ts} style={{ fontSize: 13, marginBottom: 4 }}>
          <code>{new Date(e.ts).toLocaleTimeString()} - {e.name}</code>
        </div>
      ))}
      <h3>Logs (subtree)</h3>
      {loading && <div style={{ color: '#666' }}>Loading logs...</div>}
      {error && <div style={{ color: 'red' }}>Error loading logs: {error}</div>}
      {!loading && !error && filteredLogs.length === 0 && <div style={{ color: '#666' }}>No logs in subtree</div>}
      {!loading && filteredLogs.length > 0 && (
        <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid #ddd', borderRadius: 4 }}>          
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'monospace' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f8f9fa' }}>
              <tr>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Span</th>
                <th style={thStyle}>Level</th>
                <th style={thStyle}>Log</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((l, idx) => {
                const s = l.spanId ? spanById[l.spanId] : undefined;
                const isCurrent = l.spanId === span.spanId;
                return (
                  <tr key={l.ts + idx} style={{ background: isCurrent ? '#fffadd' : 'transparent' }}>
                    <td style={tdStyle}>{new Date(l.ts).toLocaleTimeString()}</td>
                    <td style={{ ...tdStyle, cursor: s ? 'pointer' : 'default', color: s ? '#0366d6' : '#555' }} onClick={() => s && onSelectSpan(s)}>
                      {s ? s.label : '(root)'}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: l.level === 'error' ? '#d00' : l.level === 'debug' ? '#0366d6' : '#222' }}>{l.level.toUpperCase()}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'pre-wrap' }}>{l.message}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid #ccc', position: 'sticky', top: 0 };
const tdStyle: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid #eee', verticalAlign: 'top' };
