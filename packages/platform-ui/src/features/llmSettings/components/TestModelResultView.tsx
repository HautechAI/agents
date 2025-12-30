import { type ReactElement } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { LiteLLMHealthResponse } from '@/api/modules/llmSettings';

export type TestModelErrorState = {
  message: string;
  payload?: unknown;
};

function formatTestModelPayload(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

interface TestModelResultViewProps {
  result?: LiteLLMHealthResponse;
  error?: TestModelErrorState;
}

export function TestModelResultView({ result, error }: TestModelResultViewProps): ReactElement {
  const success = Boolean(result);
  const payload = success ? result : error?.payload;
  const payloadText = formatTestModelPayload(payload);
  const statusText = success ? 'Test succeeded' : 'Test failed';
  const detailMessage = success ? undefined : error?.message;

  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
      <span
        className={cn(
          'mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-transparent',
          success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
        )}
        aria-hidden
      >
        {success ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      </span>
      <div className="flex-1 space-y-2">
        <p className="font-semibold text-[var(--agyn-dark)]">{statusText}</p>
        {detailMessage ? <p className="text-sm text-[var(--agyn-text-subtle)]">{detailMessage}</p> : null}
        {payloadText ? (
          <pre className="max-h-72 overflow-auto rounded border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
            {payloadText}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
