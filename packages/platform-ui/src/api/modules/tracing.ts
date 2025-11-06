import { httpJson } from '@/api/client';
import { config } from '@/config';
import type { SpanDoc } from '@/api/types/tracing';

export async function fetchSpansInRange(fromIso: string, toIso: string): Promise<SpanDoc[]> {
  const res = await httpJson<{ items: SpanDoc[] }>(`/v1/spans?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`, undefined, config.tracing.serverUrl);
  return res?.items || [];
}

export async function fetchRunningSpansFromTo(fromIso: string, toIso: string): Promise<SpanDoc[]> {
  const res = await httpJson<{ items: SpanDoc[] }>(`/v1/spans?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}&status=running`, undefined, config.tracing.serverUrl);
  return res?.items || [];
}
