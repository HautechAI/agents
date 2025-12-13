import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Input } from '@/components/ui/input';
import type { EnvVar } from '@/components/nodeProperties/types';
import { getCanonicalToolName } from '@/components/nodeProperties/toolCanonicalNames';
import { isValidToolName, readEnvList, serializeEnvVars } from '@/components/nodeProperties/utils';
import type { StaticConfigViewProps } from './types';
import ReferenceEnvField from './shared/ReferenceEnvField';
import { ToolNameLabel } from './shared/ToolNameLabel';

export default function ShellToolConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo<Record<string, unknown>>(() => ({ ...(value || {}) }), [value]);
  const [name, setName] = useState<string>((init.name as string) || '');
  const [workdir, setWorkdir] = useState<string>((init.workdir as string) || (init.workingDir as string) || '/workspace');
  const [env, setEnv] = useState<EnvVar[]>(() => readEnvList(init.env));
  const [executionTimeoutMs, setExecutionTimeoutMs] = useState<number>(
    typeof init.executionTimeoutMs === 'number' ? (init.executionTimeoutMs as number) : 60 * 60 * 1000,
  );
  const [idleTimeoutMs, setIdleTimeoutMs] = useState<number>(
    typeof init.idleTimeoutMs === 'number' ? (init.idleTimeoutMs as number) : 60 * 1000,
  );
  const [outputLimitChars, setOutputLimitChars] = useState<number>(() => {
    const v = init['outputLimitChars'];
    return typeof v === 'number' ? v : 50000;
  });
  const [chunkCoalesceMs, setChunkCoalesceMs] = useState<number>(() => {
    const v = init['chunkCoalesceMs'];
    return typeof v === 'number' ? v : 40;
  });
  const [chunkSizeBytes, setChunkSizeBytes] = useState<number>(() => {
    const v = init['chunkSizeBytes'];
    return typeof v === 'number' ? v : 4096;
  });
  const [clientBufferLimitBytes, setClientBufferLimitBytes] = useState<number>(() => {
    const v = init['clientBufferLimitBytes'];
    return typeof v === 'number' ? v : 10 * 1024 * 1024;
  });
  const [logToPid1, setLogToPid1] = useState<boolean>(() => {
    const v = init['logToPid1'];
    return typeof v === 'boolean' ? v : true;
  });
  const [nameError, setNameError] = useState<string | null>(null);

  const isDisabled = !!readOnly || !!disabled;
  const namePlaceholder = getCanonicalToolName('shellTool');

  useEffect(() => {
    const errors: string[] = [];
    const trimmedName = name.trim();
    const hasName = trimmedName.length > 0;
    const nameValid = !hasName || isValidToolName(trimmedName);
    const inRange = (v: number) => v === 0 || (Number.isInteger(v) && v >= 1000 && v <= 86400000);
    if (!inRange(executionTimeoutMs)) errors.push('executionTimeoutMs must be 0 or 1000-86400000');
    if (!inRange(idleTimeoutMs)) errors.push('idleTimeoutMs must be 0 or 1000-86400000');
    const outputLimitInRange = (v: number) => v === 0 || (Number.isInteger(v) && v > 0);
    if (!outputLimitInRange(outputLimitChars)) errors.push('outputLimitChars must be 0 or a positive integer');
    const chunkCoalesceInRange = (v: number) => Number.isInteger(v) && v >= 5 && v <= 1000;
    if (!chunkCoalesceInRange(chunkCoalesceMs)) errors.push('chunkCoalesceMs must be 5-1000');
    const chunkSizeInRange = (v: number) => Number.isInteger(v) && v >= 256 && v <= 16384;
    if (!chunkSizeInRange(chunkSizeBytes)) errors.push('chunkSizeBytes must be 256-16384');
    const bufferLimitInRange = (v: number) => Number.isInteger(v) && v >= 1024 && v <= 50 * 1024 * 1024;
    if (!bufferLimitInRange(clientBufferLimitBytes)) errors.push('clientBufferLimitBytes must be 1024-52428800');
    if (!nameValid) {
      errors.push('Name must match ^[a-z0-9_]{1,64}$');
      setNameError('Name must match ^[a-z0-9_]{1,64}$');
    } else {
      setNameError(null);
    }
    onValidate?.(errors);
  }, [workdir, executionTimeoutMs, idleTimeoutMs, outputLimitChars, chunkCoalesceMs, chunkSizeBytes, clientBufferLimitBytes, name, onValidate]);

  useEffect(() => {
    setEnv(readEnvList(init.env));
  }, [init]);

  useEffect(() => {
    setName((init.name as string) || '');
  }, [init]);

  useEffect(() => {
    setWorkdir((init.workdir as string) || (init.workingDir as string) || '/workspace');
    setExecutionTimeoutMs(
      typeof init.executionTimeoutMs === 'number' ? (init.executionTimeoutMs as number) : 60 * 60 * 1000,
    );
    setIdleTimeoutMs(typeof init.idleTimeoutMs === 'number' ? (init.idleTimeoutMs as number) : 60 * 1000);
    setOutputLimitChars(() => {
      const v = init['outputLimitChars'];
      return typeof v === 'number' ? v : 50000;
    });
    setChunkCoalesceMs(() => {
      const v = init['chunkCoalesceMs'];
      return typeof v === 'number' ? v : 40;
    });
    setChunkSizeBytes(() => {
      const v = init['chunkSizeBytes'];
      return typeof v === 'number' ? v : 4096;
    });
    setClientBufferLimitBytes(() => {
      const v = init['clientBufferLimitBytes'];
      return typeof v === 'number' ? v : 10 * 1024 * 1024;
    });
    setLogToPid1(() => {
      const v = init['logToPid1'];
      return typeof v === 'boolean' ? v : true;
    });
  }, [init]);

  useEffect(() => {
    const trimmedName = name.trim();
    let nextName: string | undefined;
    if (trimmedName.length === 0) {
      nextName = undefined;
    } else if (isValidToolName(trimmedName)) {
      nextName = trimmedName;
    } else {
      nextName = typeof init.name === 'string' ? (init.name as string) : undefined;
    }

    const next: Record<string, unknown> = { ...(value || {}) };
    next.name = nextName;
    next.workdir = workdir;
    next.env = serializeEnvVars(env);
    next.executionTimeoutMs = executionTimeoutMs;
    next.idleTimeoutMs = idleTimeoutMs;
    next.outputLimitChars = outputLimitChars;
    next.chunkCoalesceMs = chunkCoalesceMs;
    next.chunkSizeBytes = chunkSizeBytes;
    next.clientBufferLimitBytes = clientBufferLimitBytes;
    const prevLogToPid1 = typeof value?.logToPid1 === 'boolean' ? (value.logToPid1 as boolean) : undefined;
    const shouldPersistLogToPid1 = prevLogToPid1 !== undefined || logToPid1 !== true;
    if (shouldPersistLogToPid1) {
      next.logToPid1 = logToPid1;
    } else {
      delete next.logToPid1;
    }
    if (JSON.stringify(value || {}) !== JSON.stringify(next)) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, workdir, JSON.stringify(env), executionTimeoutMs, idleTimeoutMs, outputLimitChars, chunkCoalesceMs, chunkSizeBytes, clientBufferLimitBytes, logToPid1]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <ToolNameLabel />
        <Input
          value={name}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          disabled={isDisabled}
          placeholder={namePlaceholder || 'shell_command'}
          aria-invalid={nameError ? 'true' : undefined}
        />
        {nameError && <div className="text-[10px] text-red-600 mt-1">{nameError}</div>}
      </div>
      <div>
        <label htmlFor="workdir" className="block text-xs mb-1">Working directory</label>
        <Input id="workdir" value={workdir} onChange={(e: ChangeEvent<HTMLInputElement>) => setWorkdir(e.target.value)} disabled={isDisabled} />
      </div>
      <div>
        <div className="text-xs mb-1">Environment</div>
        <ReferenceEnvField value={env} onChange={(next) => setEnv(next)} readOnly={readOnly} disabled={disabled} addLabel="Add env" onValidate={onValidate} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="executionTimeoutMs" className="block text-xs mb-1">Execution timeout (ms)</label>
          <Input id="executionTimeoutMs" type="number" min={0} value={executionTimeoutMs} onChange={(e: ChangeEvent<HTMLInputElement>) => setExecutionTimeoutMs(parseInt(e.target.value || '0', 10))} disabled={isDisabled} />
        </div>
        <div>
          <label htmlFor="idleTimeoutMs" className="block text-xs mb-1">Idle timeout (ms)</label>
          <Input id="idleTimeoutMs" type="number" min={0} value={idleTimeoutMs} onChange={(e: ChangeEvent<HTMLInputElement>) => setIdleTimeoutMs(parseInt(e.target.value || '0', 10))} disabled={isDisabled} />
        </div>
      </div>
      <div>
        <label htmlFor="outputLimitChars" className="block text-xs mb-1">Output limit (characters)</label>
        <Input
          id="outputLimitChars"
          type="number"
          min={0}
          value={outputLimitChars}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setOutputLimitChars(parseInt(e.target.value || '0', 10))}
          disabled={isDisabled}
        />
        <div className="text-[10px] text-muted-foreground mt-1">
          Maximum combined cleaned stdout+stderr length. If greater than 0 and exceeded, output is saved to /tmp/&lt;uuid&gt;.txt and a short error message is returned.
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label htmlFor="chunkCoalesceMs" className="block text-xs mb-1">Chunk coalesce (ms)</label>
          <Input
            id="chunkCoalesceMs"
            type="number"
            min={5}
            max={1000}
            value={chunkCoalesceMs}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setChunkCoalesceMs(parseInt(e.target.value || '0', 10))}
            disabled={isDisabled}
          />
          <div className="text-[10px] text-muted-foreground mt-1">Milliseconds to buffer stdout/stderr before emitting a chunk.</div>
        </div>
        <div>
          <label htmlFor="chunkSizeBytes" className="block text-xs mb-1">Chunk size (bytes)</label>
          <Input
            id="chunkSizeBytes"
            type="number"
            min={256}
            max={16384}
            value={chunkSizeBytes}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setChunkSizeBytes(parseInt(e.target.value || '0', 10))}
            disabled={isDisabled}
          />
          <div className="text-[10px] text-muted-foreground mt-1">Maximum UTF-8 bytes per chunk before forcing an emit.</div>
        </div>
        <div>
          <label htmlFor="clientBufferLimitBytes" className="block text-xs mb-1">Client buffer limit (bytes)</label>
          <Input
            id="clientBufferLimitBytes"
            type="number"
            min={1024}
            max={50 * 1024 * 1024}
            value={clientBufferLimitBytes}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setClientBufferLimitBytes(parseInt(e.target.value || '0', 10))}
            disabled={isDisabled}
          />
          <div className="text-[10px] text-muted-foreground mt-1">Maximum streamed bytes delivered to clients before truncation.</div>
        </div>
      </div>
      <div className="flex items-center justify-between rounded border border-border px-3 py-2">
        <div className="mr-4">
          <label htmlFor="logToPid1" className="text-xs font-medium text-[var(--agyn-dark)]">Log to PID 1</label>
          <div className="text-[10px] text-muted-foreground mt-1">
            Duplicate stdout/stderr to PID 1 (requires /bin/bash).
          </div>
        </div>
        <input
          id="logToPid1"
          type="checkbox"
          className="h-4 w-4"
          checked={logToPid1}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setLogToPid1(e.target.checked)}
          disabled={isDisabled}
        />
      </div>
    </div>
  );
}
