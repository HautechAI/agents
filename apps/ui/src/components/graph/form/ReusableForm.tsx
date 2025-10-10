import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { useMemo } from 'react';
import type { JsonSchemaObject } from './types';
import { buildUiSchema } from './uiSchema';
import { templates } from './templates';
import { widgets } from './widgets';
import { fieldsRegistry } from './fieldRegistry';

export interface ReusableFormProps {
  schema: JsonSchemaObject;
  formData?: Record<string, unknown>;
  onChange?: (data: Record<string, unknown>) => void;
  disableSubmit?: boolean;
  onSubmit?: (data: Record<string, unknown>) => void;
  submitDisabled?: boolean; // external pending state
  hideSubmitButton?: boolean; // force hide even if disableSubmit false
}
export function ReusableForm({
  schema,
  formData,
  onChange,
  disableSubmit = true,
  onSubmit,
  submitDisabled,
  hideSubmitButton,
}: ReusableFormProps) {
  const uiSchema = useMemo(() => buildUiSchema(schema), [schema]);

  // Map legacy shapes to unified schema on load so RJSF renders the new fields.
  const mappedInitial = useMemo(() => mapLegacyToUnified(formData), [formData]);

  return (
    <Form
      schema={schema as JsonSchemaObject}
      formData={mappedInitial}
      validator={validator}
      uiSchema={uiSchema as unknown as Record<string, unknown>}
      templates={templates}
      // @ts-expect-error registry typing mismatch
      fields={fieldsRegistry}
      widgets={widgets}
      onChange={({ formData: next }) => onChange?.(stripLegacy(next as Record<string, unknown>))}
      onSubmit={({ formData: submitData }) => onSubmit?.(submitData as Record<string, unknown>)}
    >
      {!disableSubmit && !hideSubmitButton && (
        <button
          type="submit"
          disabled={submitDisabled}
          className="mt-2 rounded border px-2 py-1 text-xs hover:bg-accent/50 disabled:opacity-50"
        >
          Save
        </button>
      )}
    </Form>
  );
}

// --- Legacy mapping helpers ---
// Translates incoming config containing legacy env/envRefs and authRef
// into the new unified shapes: env: Array<{key,value,source?}>, token: {value,source?}
function mapLegacyToUnified(data?: Record<string, unknown>) {
  if (!data || typeof data !== 'object') return data;
  const src = data as Record<string, any>;
  // If already using new shapes, just drop legacy keys
  const next: Record<string, any> = { ...src };

  // Workspace env: combine legacy env (map) and envRefs into new env array when needed
  const hasArrayEnv = Array.isArray(next.env);
  const legacyEnvIsMap = next.env && typeof next.env === 'object' && !Array.isArray(next.env);
  const hasLegacyEnvRefs = next.envRefs && typeof next.envRefs === 'object';
  if (!hasArrayEnv && (legacyEnvIsMap || hasLegacyEnvRefs)) {
    const out: Array<{ key: string; value: string; source?: 'static' | 'vault' }> = [];
    const pushUnique = (k: string, v: string, source: 'static' | 'vault') => {
      if (!k) return;
      // Prefer first occurrence; callers want deterministic merge order: env then envRefs
      if (out.find((e) => e.key === k)) return;
      out.push({ key: k, value: v, source });
    };
    if (legacyEnvIsMap) {
      Object.entries(next.env as Record<string, string | number | boolean>).forEach(([k, v]) =>
        pushUnique(k, String(v ?? ''), 'static'),
      );
    }
    if (hasLegacyEnvRefs) {
      const refs = next.envRefs as Record<string, { mount?: string; path?: string; key?: string }>;
      for (const [k, ref] of Object.entries(refs || {})) {
        const mount = (ref.mount || 'secret').replace(/\/$/, '');
        const path = ref.path || '';
        const key = ref.key || 'value';
        if (!path) continue;
        pushUnique(k, `${mount}/${path}/${key}`.replace(/\/+/g, '/'), 'vault');
      }
    }
    if (out.length > 0) next.env = out;
  }
  // GitHub Clone token: map legacy authRef when token absent
  if (!next.token && next.authRef && typeof next.authRef === 'object') {
    const ar = next.authRef as { source?: 'env' | 'vault'; envVar?: string; mount?: string; path?: string; key?: string };
    if (ar.source === 'vault') {
      const mount = (ar.mount || 'secret').replace(/\/$/, '');
      const path = ar.path || '';
      const key = ar.key || 'GH_TOKEN';
      if (path) next.token = { value: `${mount}/${path}/${key}`.replace(/\/+/g, '/'), source: 'vault' };
    }
    // When env-based, leave token undefined so server falls back as designed
  }

  // Always strip legacy fields from what RJSF sees
  delete next.envRefs;
  delete next.authRef;
  return next;
}

// Remove legacy-only keys from outgoing values before emitting upstream
function stripLegacy(data?: Record<string, unknown>): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  const out = { ...(data as Record<string, unknown>) } as Record<string, unknown>;
  delete (out as Record<string, unknown>)['envRefs'];
  delete (out as Record<string, unknown>)['authRef'];
  return out;
}
