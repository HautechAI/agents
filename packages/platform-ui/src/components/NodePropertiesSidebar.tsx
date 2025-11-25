import { useCallback, useMemo, useState } from 'react';
import Badge from './Badge';
import { Input } from './Input';
import { NodeActionButtons } from './graph/NodeActionButtons';
import { NodeStatusBadges } from './graph/NodeStatusBadges';
import { ToolItem } from './ToolItem';
import { getConfigView } from '@/components/configViews/registry';
import type { NodeKind } from './Node';
import type { GraphNodeCapabilities, GraphNodeStatus } from '@/features/graph/types';

interface NodeIdentity {
  id: string;
  title: string;
  template: string;
  kind: NodeKind;
}

interface NodeStatusDescriptor {
  status: GraphNodeStatus;
  runtimeState?: GraphNodeStatus;
  runtimeDetails?: unknown;
  isPaused?: boolean;
}

interface NodeToolInfo {
  name: string;
  title?: string | null;
  description?: string | null;
}

interface NodeRunInfo {
  runId: string;
  threadId: string;
  status: string;
  updatedAt: string;
}

interface NodeActionHandlers {
  onProvision?: () => void;
  onDeprovision?: () => void;
  onTerminateRun?: (runId: string) => void;
  onTerminateThread?: (threadId: string) => void;
  actionPending?: boolean;
  terminatingRunIds?: ReadonlySet<string> | string[];
  terminatingThreadIds?: ReadonlySet<string> | string[];
}

export interface NodePropertiesSidebarProps {
  identity?: NodeIdentity;
  status?: NodeStatusDescriptor;
  capabilities?: GraphNodeCapabilities;
  config?: Record<string, unknown>;
  onConfigChange?: (nextConfig: Record<string, unknown>) => void;
  onTitleChange?: (title: string) => void;
  state?: Record<string, unknown>;
  tools?: NodeToolInfo[];
  enabledTools?: string[];
  onToggleTool?: (name: string, enabled: boolean) => void;
  toolsLoading?: boolean;
  runs?: NodeRunInfo[];
  actions?: NodeActionHandlers;
}

type StatusVariant = {
  label: string;
  color: string;
  bgColor: string;
};

const statusDisplay: Record<GraphNodeStatus, StatusVariant> = {
  not_ready: { label: 'Not Ready', color: 'var(--agyn-gray)', bgColor: 'var(--agyn-bg-light)' },
  provisioning: {
    label: 'Provisioning',
    color: 'var(--agyn-status-running)',
    bgColor: 'var(--agyn-status-running-bg)',
  },
  ready: { label: 'Ready', color: 'var(--agyn-status-finished)', bgColor: 'var(--agyn-status-finished-bg)' },
  deprovisioning: {
    label: 'Deprovisioning',
    color: 'var(--agyn-status-pending)',
    bgColor: 'var(--agyn-status-pending-bg)',
  },
  provisioning_error: {
    label: 'Provisioning Error',
    color: 'var(--agyn-status-failed)',
    bgColor: 'var(--agyn-status-failed-bg)',
  },
  deprovisioning_error: {
    label: 'Deprovisioning Error',
    color: 'var(--agyn-status-failed)',
    bgColor: 'var(--agyn-status-failed-bg)',
  },
};

function serialize(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function ensureSet(values?: ReadonlySet<string> | string[]) {
  if (!values) return new Set<string>();
  if (values instanceof Set) return values;
  return new Set(values);
}

export default function NodePropertiesSidebar({
  identity,
  status,
  capabilities,
  config,
  onConfigChange,
  onTitleChange,
  state,
  tools,
  enabledTools,
  onToggleTool,
  toolsLoading,
  runs,
  actions,
}: NodePropertiesSidebarProps) {
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const effectiveStatus = status?.runtimeState ?? status?.status ?? 'not_ready';
  const statusInfo = statusDisplay[effectiveStatus];
  const provisionable = capabilities?.provisionable ?? false;
  const pausable = capabilities?.pausable ?? false;
  const runtimeDetails = status?.runtimeDetails;
  const isPaused = status?.isPaused ?? false;
  const actionPending = actions?.actionPending ?? false;

  const terminatingRunIds = useMemo(() => ensureSet(actions?.terminatingRunIds), [actions?.terminatingRunIds]);
  const terminatingThreadIds = useMemo(
    () => ensureSet(actions?.terminatingThreadIds),
    [actions?.terminatingThreadIds],
  );

  const titleValue = identity?.title ?? (typeof config?.title === 'string' ? String(config.title) : '');

  const StaticView = identity ? getConfigView(identity.template, 'static') : null;
  const configJson = useMemo(() => serialize(config), [config]);
  const stateJson = useMemo(() => serialize(state), [state]);

  const enabledSet = useMemo(() => new Set(enabledTools ?? []), [enabledTools]);

  const canStart = useMemo(() => {
    if (!provisionable) return false;
    if (actionPending) return false;
    return ['not_ready', 'provisioning_error', 'deprovisioning_error'].includes(effectiveStatus);
  }, [actionPending, effectiveStatus, provisionable]);

  const canStop = useMemo(() => {
    if (!provisionable) return false;
    if (actionPending) return false;
    return effectiveStatus === 'ready' || effectiveStatus === 'provisioning';
  }, [actionPending, effectiveStatus, provisionable]);

  const handleTitleChange = useCallback(
    (value: string) => {
      onTitleChange?.(value);
    },
    [onTitleChange],
  );

  const handleConfigChange = useCallback(
    (next: Record<string, unknown>) => {
      onConfigChange?.(next);
    },
    [onConfigChange],
  );

  const handleValidate = useCallback((errors?: string[]) => {
    setValidationErrors(errors ?? []);
  }, []);

  return (
    <div className="w-[420px] bg-white border-l border-[var(--agyn-border-default)] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--agyn-border-default)]">
        <div>
          <h2 className="text-[var(--agyn-dark)]">Node Properties</h2>
          <p className="text-sm text-[var(--agyn-gray)] mt-0.5">{identity?.title ?? 'Unnamed Node'}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge color={statusInfo.color} bgColor={statusInfo.bgColor}>
            {statusInfo.label}
          </Badge>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
        <section className="space-y-3">
          <div className="text-[10px] uppercase text-muted-foreground">Runtime Status</div>
          <NodeStatusBadges state={effectiveStatus} isPaused={isPaused} detail={runtimeDetails} />
          <NodeActionButtons
            provisionable={provisionable}
            pausable={pausable}
            canStart={canStart}
            canStop={canStop}
            onStart={() => actions?.onProvision?.()}
            onStop={() => actions?.onDeprovision?.()}
          />
        </section>

        <section className="space-y-3">
          <div className="text-[10px] uppercase text-muted-foreground">Title</div>
          <Input
            value={titleValue}
            onChange={(event) => handleTitleChange(event.target.value)}
            size="sm"
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase text-muted-foreground">Static Configuration</div>
            {identity?.template ? (
              <div className="text-[10px] text-muted-foreground">Template: {identity.template}</div>
            ) : null}
          </div>
          {StaticView ? (
            <StaticView
              key={`static-${identity?.id ?? 'unknown'}`}
              templateName={identity?.template ?? 'unknown'}
              value={config ?? {}}
              onChange={handleConfigChange}
              readOnly={false}
              disabled={false}
              onValidate={handleValidate}
            />
          ) : (
            <pre className="text-xs bg-[var(--agyn-bg-light)] rounded-md p-3 whitespace-pre-wrap break-all">{configJson}</pre>
          )}
          {validationErrors.length > 0 ? (
            <div className="text-xs text-[var(--agyn-status-failed)] space-y-1">
              {validationErrors.map((err, idx) => (
                <div key={idx}>• {err}</div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <div className="text-[10px] uppercase text-muted-foreground">Node State</div>
          <pre className="text-xs bg-[var(--agyn-bg-light)] rounded-md p-3 whitespace-pre-wrap break-all">{stateJson}</pre>
        </section>

        {runs ? (
          <section className="space-y-3">
            <div className="text-[10px] uppercase text-muted-foreground">Active Runs</div>
            {runs.length === 0 ? (
              <div className="text-xs text-muted-foreground">None</div>
            ) : (
              <ul className="space-y-2">
                {runs.map((run) => {
                  const runTerminating = terminatingRunIds.has(run.runId) || run.status === 'terminating';
                  const threadTerminating = terminatingThreadIds.has(run.threadId);
                  return (
                    <li key={run.runId} className="border border-[var(--agyn-border-subtle)] rounded-md p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate">
                          <div className="font-mono truncate" title={run.threadId}>
                            {run.threadId}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground truncate" title={run.runId}>
                            {run.runId}
                          </div>
                        </div>
                        <Badge color="var(--agyn-dark)" bgColor="var(--agyn-bg-light)">
                          {run.status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span>Updated {new Date(run.updatedAt).toLocaleTimeString()}</span>
                        <div className="flex items-center gap-2">
                          {actions?.onTerminateRun ? (
                            <button
                              type="button"
                              className="text-[11px] text-[var(--agyn-status-failed)] hover:underline disabled:opacity-50"
                              disabled={runTerminating}
                              onClick={() => actions.onTerminateRun?.(run.runId)}
                            >
                              Terminate Run
                            </button>
                          ) : null}
                          {actions?.onTerminateThread ? (
                            <button
                              type="button"
                              className="text-[11px] text-[var(--agyn-status-failed)] hover:underline disabled:opacity-50"
                              disabled={threadTerminating}
                              onClick={() => actions.onTerminateThread?.(run.threadId)}
                            >
                              Terminate Thread
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        {tools ? (
          <section className="space-y-3">
            <div className="text-[10px] uppercase text-muted-foreground">Tools</div>
            {toolsLoading ? (
              <div className="text-xs text-muted-foreground">Loading tools…</div>
            ) : tools.length === 0 ? (
              <div className="text-xs text-muted-foreground">No tools reported for this node.</div>
            ) : (
              <div className="space-y-3">
                {tools.map((tool) => (
                  <ToolItem
                    key={tool.name}
                    name={tool.title ?? tool.name}
                    description={tool.description ?? 'No description provided.'}
                    enabled={enabledSet.has(tool.name)}
                    onToggle={(value) => onToggleTool?.(tool.name, value)}
                  />
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
