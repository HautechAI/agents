import React, { useMemo } from 'react';
import { useTemplatesCache } from '../../lib/graph/templates.provider';
import { useNodeAction, useNodeStatus } from '../../lib/graph/hooks';
import { canPause } from '../../lib/graph/capabilities';
import type { ProvisionState } from '../../lib/graph/types';

function Chip({ color, children }: { color: 'gray' | 'blue' | 'green' | 'red' | 'yellow'; children: React.ReactNode }) {
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-200 text-gray-800',
    blue: 'bg-blue-200 text-blue-800',
    green: 'bg-green-200 text-green-800',
    red: 'bg-red-200 text-red-800',
    yellow: 'bg-yellow-200 text-yellow-800',
  };
  return <span className={`px-2 py-1 rounded text-xs ${colorMap[color]}`}>{children}</span>;
}

function statusColor(state: ProvisionState | undefined): 'gray' | 'blue' | 'green' | 'red' | 'yellow' {
  switch (state) {
    case 'provisioning':
      return 'blue';
    case 'ready':
      return 'green';
    case 'error':
      return 'red';
    case 'deprovisioning':
      return 'yellow';
    case 'not_ready':
    default:
      return 'gray';
  }
}

export function NodeDetailsPanel({ nodeId, templateName }: { nodeId: string; templateName: string }) {
  const { getTemplate } = useTemplatesCache();
  const tmpl = getTemplate(templateName);
  const { data: status } = useNodeStatus(nodeId);
  const action = useNodeAction(nodeId);

  const pausable = tmpl ? canPause(tmpl) : false;
  const state = status?.provisionStatus?.state ?? 'not_ready';
  const isPaused = !!status?.isPaused;

  // Compute disabled states
  const disableAll = state === 'deprovisioning';
  const canStart = state === 'not_ready' && !disableAll;
  const canStop = (state === 'ready' || state === 'provisioning') && !disableAll;
  const canPauseBtn = pausable && state === 'ready' && !isPaused && !disableAll;
  const canResumeBtn = pausable && state === 'ready' && isPaused && !disableAll;

  const onStart = () => action.mutate('provision');
  const onStop = () => action.mutate('deprovision');
  const onPause = () => action.mutate('pause');
  const onResume = () => action.mutate('resume');

  const detail = status?.provisionStatus?.details;

  return (
    <div className="p-4 border rounded space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Node {nodeId}</div>
        <div className="text-sm text-gray-600">Template: {templateName}</div>
      </div>

      <div className="flex items-center gap-2">
        <Chip color={statusColor(state)}>{state}</Chip>
        {isPaused && <Chip color="yellow">paused</Chip>}
        {state === 'error' && detail ? (
          <span className="text-xs text-red-700" title={typeof detail === 'string' ? detail : JSON.stringify(detail)}>
            details
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button className="px-3 py-1 rounded bg-green-600 text-white disabled:opacity-50" onClick={onStart} disabled={!canStart}>
          Start
        </button>
        <button className="px-3 py-1 rounded bg-red-600 text-white disabled:opacity-50" onClick={onStop} disabled={!canStop}>
          Stop
        </button>
        {pausable && (
          <>
            <button className="px-3 py-1 rounded bg-yellow-600 text-white disabled:opacity-50" onClick={onPause} disabled={!canPauseBtn}>
              Pause
            </button>
            <button className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50" onClick={onResume} disabled={!canResumeBtn}>
              Resume
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default NodeDetailsPanel;
