import type { ReferenceConfigValue } from '@/components/nodeProperties/types';
import {
  encodeReferenceValue,
  inferReferenceSource,
  isRecord,
  readReferenceValue,
  type ReferenceSourceType,
} from '@/components/nodeProperties/utils';

export type LegacyReferenceValue = { value?: string; source?: 'static' | 'vault' | 'variable' };

export function normalizeReferenceValue(input: unknown): ReferenceConfigValue {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  if (!isRecord(input)) return '';

  if (typeof input.kind === 'string') {
    if (input.kind === 'vault' || input.kind === 'var') {
      return input as ReferenceConfigValue;
    }
  }

  const legacy = input as LegacyReferenceValue;
  const value = typeof legacy.value === 'string' ? legacy.value : '';
  const source: ReferenceSourceType =
    legacy.source === 'vault' ? 'secret' : legacy.source === 'variable' ? 'variable' : 'text';
  return encodeReferenceValue(source, value, input as ReferenceConfigValue);
}

export function readReferenceDetails(raw: unknown): {
  value: string;
  sourceType: ReferenceSourceType;
  raw: ReferenceConfigValue;
} {
  const normalized = normalizeReferenceValue(raw);
  return {
    value: readReferenceValue(normalized).value,
    sourceType: inferReferenceSource(normalized),
    raw: normalized,
  };
}
