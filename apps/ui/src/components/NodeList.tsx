import React from 'react';
import { Badge } from './Badge';
import { DisplayNode } from '../utils/nodeDisplay';

export const NodeList: React.FC<{ nodes: DisplayNode[] }> = ({ nodes }) => {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {nodes.map((n) => (
        <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <Badge kind={n.kind ?? 'unknown'} />
          <span style={{ fontWeight: 600 }}>{n.displayTitle}</span>
          <span style={{ fontSize: 12, color: '#6b7280' }}>({n.template})</span>
        </div>
      ))}
    </div>
  );
};
