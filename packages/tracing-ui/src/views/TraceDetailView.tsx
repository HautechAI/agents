import React from 'react';
import { fetchTrace } from '../services/api';
import { SpanHierarchyPage } from '../pages/SpanHierarchyPage';

export function TraceDetailView({ traceId }: { traceId: string }) {
  if (!traceId) return <div style={{ padding: 16 }}>Missing traceId</div>;
  return <SpanHierarchyPage mode="trace" id={traceId} fetcher={fetchTrace} />;
}

