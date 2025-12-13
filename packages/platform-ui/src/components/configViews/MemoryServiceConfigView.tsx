import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Input } from '@/components/ui/input';
import { SelectField, Field } from '@/components/sharedFormFields';
import type { StaticConfigViewProps } from './types';

const SCOPE_OPTIONS = [
  { value: 'global', label: 'Global (shared across threads)' },
  { value: 'perThread', label: 'Per thread' },
];

function normalizeScope(value: unknown): 'global' | 'perThread' {
  if (value === 'perThread' || value === 'thread') {
    return 'perThread';
  }
  return 'global';
}

function readOptionalString(source: unknown): string {
  return typeof source === 'string' ? (source as string) : '';
}

export default function MemoryServiceConfigView({ value, onChange, readOnly, disabled }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [scope, setScope] = useState<'global' | 'perThread'>(normalizeScope(init.scope));
  const [collectionPrefix, setCollectionPrefix] = useState<string>(readOptionalString(init.collectionPrefix));
  const [title, setTitle] = useState<string>(readOptionalString(init.title));
  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    setScope(normalizeScope(init.scope));
    setCollectionPrefix(readOptionalString(init.collectionPrefix));
    setTitle(readOptionalString(init.title));
  }, [init]);

  useEffect(() => {
    const trimmedPrefix = collectionPrefix.trim();
    const normalizedPrefix = trimmedPrefix.length > 0 ? trimmedPrefix : undefined;
    const trimmedTitle = title.trim();
    const normalizedTitle = trimmedTitle.length > 0 ? trimmedTitle : undefined;

    const prevRecord = (value ?? {}) as Record<string, unknown>;
    const prevScope = normalizeScope(prevRecord.scope);
    const prevPrefix = typeof prevRecord.collectionPrefix === 'string'
      ? (prevRecord.collectionPrefix as string)
      : undefined;
    const prevTitle = typeof prevRecord.title === 'string' ? (prevRecord.title as string) : undefined;

    if (prevScope === scope && prevPrefix === normalizedPrefix && prevTitle === normalizedTitle) {
      return;
    }

    onChange({
      ...value,
      scope,
      collectionPrefix: normalizedPrefix,
      title: normalizedTitle,
    });
  }, [collectionPrefix, scope, title, value, onChange]);

  return (
    <div className="space-y-4 text-sm">
      <SelectField
        label="Scope"
        hint="Choose where memory entries are stored"
        value={scope}
        onChange={(next) => setScope(next === 'perThread' ? 'perThread' : 'global')}
        options={SCOPE_OPTIONS}
        disabled={isDisabled}
      />
      <Field label="Collection prefix (optional)">
        <Input
          value={collectionPrefix}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setCollectionPrefix(event.target.value)}
          disabled={isDisabled}
        />
      </Field>
      <Field label="Title (optional)" hint="Display name shown in the UI">
        <Input
          value={title}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setTitle(event.target.value)}
          disabled={isDisabled}
        />
      </Field>
    </div>
  );
}
