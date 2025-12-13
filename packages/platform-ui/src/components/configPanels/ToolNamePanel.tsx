import { useCallback, useEffect, useMemo, useState } from 'react';

import { Input } from '@/components/Input';
import { Field, Section } from '@/components/sharedFormFields';
import { getCanonicalToolName } from '@/components/nodeProperties/toolCanonicalNames';
import { isValidToolName } from '@/components/nodeProperties/utils';

import type { ConfigPanelProps } from './types';

export function ToolNamePanel({ template, value, onChange, readOnly, disabled }: ConfigPanelProps) {
  const isDisabled = !!readOnly || !!disabled;
  const currentName = typeof value.name === 'string' ? (value.name as string) : '';

  const [nameInput, setNameInput] = useState(currentName);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    setNameInput(currentName);
    setNameError(null);
  }, [currentName]);

  const placeholder = useMemo(() => getCanonicalToolName(template) ?? 'tool_name', [template]);

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
      </Section>
    </div>
  );
}
