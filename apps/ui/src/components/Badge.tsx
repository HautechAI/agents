import React from 'react';

export type NodeKind = 'trigger' | 'agent' | 'tool' | 'mcp' | 'unknown';

export function badgeColor(kind: NodeKind) {
  switch (kind) {
    case 'trigger':
      return '#f59e0b'; // amber-500
    case 'agent':
      return '#6366f1'; // indigo-500
    case 'tool':
      return '#10b981'; // emerald-500
    case 'mcp':
      return '#8b5cf6'; // violet-500
    default:
      return '#6b7280'; // gray-500
  }
}

export const Badge: React.FC<{ kind: NodeKind; label?: string }> = ({ kind, label }) => {
  const color = badgeColor(kind);
  const text = label ?? kind;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        fontSize: 12,
        borderRadius: 9999,
        backgroundColor: color + '22',
        color,
        border: `1px solid ${color}55`,
        textTransform: 'capitalize',
      }}
      title={`Node kind: ${kind}`}
    >
      <span aria-hidden>●</span>
      <span>{text}</span>
    </span>
  );
};
