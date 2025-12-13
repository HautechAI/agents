import { useCallback, useEffect, useMemo, useState } from 'react';

import { Input } from '@/components/Input';
import {
  Field,
  NumberField,
  SelectField,
  Section,
} from '@/components/sharedFormFields';
import { getCanonicalToolName } from '@/components/nodeProperties/toolCanonicalNames';
import { isValidToolName } from '@/components/nodeProperties/utils';

import type { ConfigPanelProps } from './types';

const MODE_OPTIONS = [
  { value: 'sync', label: 'Sync' },
  { value: 'async', label: 'Async' },
];

export function ManageToolConfigPanel({ value, onChange, readOnly, disabled }: ConfigPanelProps) {
  const isDisabled = !!readOnly || !!disabled;
  const currentName = typeof value.name === 'string' ? (value.name as string) : '';
  const currentMode = value.mode === 'async' ? 'async' : 'sync';
  const currentTimeout = typeof value.timeoutMs === 'number' ? (value.timeoutMs as number) : undefined;

  const [nameInput, setNameInput] = useState(currentName);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    setNameInput(currentName);
    setNameError(null);
  }, [currentName]);

  const placeholder = useMemo(() => getCanonicalToolName('manageTool') ?? 'tool_name', []);

  const handleNameChange = useCallback(
    (next: string) => {
      setNameInput(next);
      const trimmed = next.trim();
      if (trimmed.length === 0) {
        setNameError(null);
        if (currentName !== '') {
          onChange({ name: undefined });
        }
        return;
      }
      if (!isValidToolName(trimmed)) {
        setNameError('Name must match ^[a-z0-9_]{1,64}$');
        return;
      }
      setNameError(null);
      if (trimmed !== currentName) {
        onChange({ name: trimmed });
      }
    },
    [currentName, onChange],
  );

  const handleModeChange = useCallback(
    (next: string) => {
      onChange({ mode: next === 'async' ? 'async' : 'sync' });
    },
    [onChange],
  );

  const handleTimeoutChange = useCallback(
    (next: number | undefined) => {
      onChange({ timeoutMs: next });
    },
    [onChange],
  );

  return (
    <div className="space-y-8 text-sm">
      <Section>
        <Field label="Name" hint="Unique identifier used when calling the tool">
          <Input
            value={nameInput}
            onChange={(event) => handleNameChange(event.target.value)}
            placeholder={placeholder}
            size="sm"
            disabled={isDisabled}
            aria-invalid={nameError ? 'true' : 'false'}
          />
          {nameError ? <p className="mt-1 text-xs text-[var(--agyn-status-failed)]">{nameError}</p> : null}
        </Field>
        <SelectField
          label="Mode"
          hint="Sync waits for child responses; async sends without waiting"
          value={currentMode}
          onChange={handleModeChange}
          options={MODE_OPTIONS}
          disabled={isDisabled}
        />
        <NumberField
          label="Timeout (ms)"
          hint="0 disables timeout (sync mode only)"
          value={currentTimeout}
          onChange={handleTimeoutChange}
          min={0}
          step={100}
          disabled={isDisabled}
        />
      </Section>
    </div>
  );
}
