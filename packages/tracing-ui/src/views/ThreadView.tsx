import React from 'react';
import { fetchThread } from '../services/api';
import { SpanHierarchyPage } from '../pages/SpanHierarchyPage';

export function ThreadView({ threadId }: { threadId: string }) {
  if (!threadId) return <div style={{ padding: 16 }}>Missing threadId</div>;
  return <SpanHierarchyPage mode="thread" id={threadId} fetcher={fetchThread} />;
}

