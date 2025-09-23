import React, { useEffect, useMemo, useState } from 'react';
import { fetchGraph, fetchTemplates } from './api';
import { Badge } from './components/Badge';
import { NodeList } from './components/NodeList';
import { augmentGraphWithTemplates, DisplayNode } from './utils/nodeDisplay';

export function App() {
  const [templates, setTemplates] = useState<Record<string, { title: string; kind: 'trigger'|'agent'|'tool'|'mcp' }>>({});
  const [graph, setGraph] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchTemplates(), fetchGraph()])
      .then(([tpls, g]) => {
        setTemplates(tpls ?? {});
        setGraph(g ?? null);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const displayNodes: DisplayNode[] = useMemo(() => augmentGraphWithTemplates(graph, templates), [graph, templates]);

  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!graph) return <div className="p-4">Loading…</div>;

  return (
    <div style={{ padding: 16, fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Agent Graph</h1>
      <NodeList nodes={displayNodes} />
      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Legend</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge kind="trigger" />
          <Badge kind="agent" />
          <Badge kind="tool" />
          <Badge kind="mcp" />
        </div>
      </div>
    </div>
  );
}
