import { useId } from 'react';

import { Input } from '../Input';
import { Toggle } from '../Toggle';

import type { EnvEditorProps } from './EnvEditor';
import { EnvEditor } from './EnvEditor';
import { FieldLabel } from './FieldLabel';
import { LimitsSection, type LimitField } from './LimitsSection';
import { toNumberOrUndefined } from './utils';

interface ToolLimits {
  executionTimeoutMs?: number;
  idleTimeoutMs?: number;
  outputLimitChars?: number;
  chunkCoalesceMs?: number;
  chunkSizeBytes?: number;
  clientBufferLimitBytes?: number;
}

interface ToolSectionProps {
  workdir: string;
  onWorkdirChange: (value: string) => void;
  envEditorProps: EnvEditorProps;
  limits: ToolLimits;
  onLimitChange: (key: keyof ToolLimits, value: number | undefined) => void;
  limitsOpen: boolean;
  onLimitsOpenChange: (open: boolean) => void;
  logToPid1: boolean;
  onLogToPid1Change: (checked: boolean) => void;
}

export function ToolSection({
  workdir,
  onWorkdirChange,
  envEditorProps,
  limits,
  onLimitChange,
  limitsOpen,
  onLimitsOpenChange,
  logToPid1,
  onLogToPid1Change,
}: ToolSectionProps) {
  const logToPid1ToggleId = useId();

  const limitFields: LimitField[] = [
    {
      key: 'executionTimeoutMs',
      label: 'Execution Timeout (ms)',
      hint: 'Maximum wall time for the command in milliseconds. 0 disables the timeout.',
      placeholder: '3600000',
      value: limits.executionTimeoutMs !== undefined ? String(limits.executionTimeoutMs) : '',
      onChange: (value) => onLimitChange('executionTimeoutMs', toNumberOrUndefined(value)),
    },
    {
      key: 'idleTimeoutMs',
      label: 'Idle Timeout (ms)',
      hint: 'Stop the command if no output is produced for this many milliseconds. 0 disables the timeout.',
      placeholder: '60000',
      value: limits.idleTimeoutMs !== undefined ? String(limits.idleTimeoutMs) : '',
      onChange: (value) => onLimitChange('idleTimeoutMs', toNumberOrUndefined(value)),
    },
    {
      key: 'outputLimitChars',
      label: 'Output Limit (characters)',
      hint: 'Maximum combined stdout/stderr characters before truncation. 0 disables the limit.',
      placeholder: '50000',
      value: limits.outputLimitChars !== undefined ? String(limits.outputLimitChars) : '',
      onChange: (value) => onLimitChange('outputLimitChars', toNumberOrUndefined(value)),
    },
    {
      key: 'chunkCoalesceMs',
      label: 'Chunk Coalesce (ms)',
      hint: 'Milliseconds to buffer stdout/stderr before emitting a chunk.',
      placeholder: '40',
      value: limits.chunkCoalesceMs !== undefined ? String(limits.chunkCoalesceMs) : '',
      onChange: (value) => onLimitChange('chunkCoalesceMs', toNumberOrUndefined(value)),
    },
    {
      key: 'chunkSizeBytes',
      label: 'Chunk Size (bytes)',
      hint: 'Maximum UTF-8 bytes per chunk before forcing an emit.',
      placeholder: '4096',
      value: limits.chunkSizeBytes !== undefined ? String(limits.chunkSizeBytes) : '',
      onChange: (value) => onLimitChange('chunkSizeBytes', toNumberOrUndefined(value)),
    },
    {
      key: 'clientBufferLimitBytes',
      label: 'Client Buffer Limit (bytes)',
      hint: 'Maximum streamed bytes delivered to clients before truncation.',
      placeholder: '10485760',
      value: limits.clientBufferLimitBytes !== undefined ? String(limits.clientBufferLimitBytes) : '',
      onChange: (value) => onLimitChange('clientBufferLimitBytes', toNumberOrUndefined(value)),
    },
  ];

  return (
    <>
      <section>
        <div className="space-y-4">
          <div>
            <FieldLabel label="Working Directory" hint="Directory to execute commands in." />
            <Input
              placeholder="/workspace"
              value={workdir}
              onChange={(event) => onWorkdirChange(event.target.value)}
              size="sm"
            />
          </div>
        </div>
      </section>

      <EnvEditor {...envEditorProps} />

      <LimitsSection
        title="Limits"
        open={limitsOpen}
        onOpenChange={onLimitsOpenChange}
        fields={limitFields}
      />

      <section>
        <div className="flex items-center justify-between">
          <div>
            <label
              htmlFor={logToPid1ToggleId}
              className="text-[var(--agyn-dark)] font-semibold cursor-pointer"
            >
              Log to PID 1
            </label>
            <p className="text-xs text-[var(--agyn-gray)] mt-1">
              Duplicate stdout/stderr to PID 1 (requires /bin/bash).
            </p>
          </div>
          <Toggle
            id={logToPid1ToggleId}
            label=""
            description=""
            checked={logToPid1}
            onCheckedChange={onLogToPid1Change}
          />
        </div>
      </section>
    </>
  );
}
