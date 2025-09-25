import React from 'react';
import { useNodeStatus, useDynamicConfig } from '../../lib/graph/hooks';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';

export default function DynamicConfigForm({ nodeId, templateName }: { nodeId: string; templateName: string }) {
  const { data: status } = useNodeStatus(nodeId);
  const ready = !!status?.dynamicConfigReady;
  const { schema, set } = useDynamicConfig(nodeId);

  if (!ready) {
    return <div className="text-sm text-gray-600">Dynamic config not available yet</div>;
  }

  const jsonSchema = schema.data as any | undefined | null;
  if (!jsonSchema) {
    return <div className="text-sm text-gray-600">Loading dynamic config schema...</div>;
  }

  return (
    <div className="space-y-2">
      <Form
        schema={jsonSchema}
        validator={validator}
        formData={{}}
        onSubmit={({ formData }) =>
          set.mutate(formData as Record<string, unknown>, {
            onSuccess: () => alert('Saved'),
            onError: () => alert('Failed to save'),
          })
        }
      >
        <button type="submit" className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50" disabled={!!set.isPending}>
          Save
        </button>
      </Form>
    </div>
  );
}
