import { httpJson } from '@/api/client';
import { config } from '@/config';
import type { SpanDoc } from '@/api/types/tracing';

export async function fetchSpansInRange(fromIso: string, toIso: string): Promise<SpanDoc[]> {
  // Use tracingApiBaseUrl; config.tracing.serverUrl was removed in API layer refactor.
  const res = await httpJson<{ items: SpanDoc[] }>(
    `/v1/spans?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
    undefined,
    config.tracingApiBaseUrl,
  );
  return res?.items || [];
}

export async function fetchRunningSpansFromTo(fromIso: string, toIso: string): Promise<SpanDoc[]> {
  // Use tracingApiBaseUrl; align with centralized client.
  const res = await httpJson<{ items: SpanDoc[] }>(
    `/v1/spans?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}&status=running`,
    undefined,
    config.tracingApiBaseUrl,
  );
  return res?.items || [];
}
