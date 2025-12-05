import { useCallback, useEffect, useMemo, useState, type FocusEventHandler } from 'react';
import { ReferenceInput } from '@/components/ReferenceInput';
import { Label } from '@/components/ui/label';
import type { ReferenceConfigValue } from '@/components/nodeProperties/types';
import {
  encodeReferenceValue,
  inferReferenceSource,
  readReferenceValue,
  type ReferenceSourceType,
  writeReferenceValue,
} from '@/components/nodeProperties/utils';
import { normalizeReferenceValue, type LegacyReferenceValue } from './referenceUtils';

export interface ReferenceFieldProps {
  label?: string;
  value?: ReferenceConfigValue | LegacyReferenceValue | string | null;
  onChange: (next: ReferenceConfigValue) => void;
  readOnly?: boolean;
  disabled?: boolean;
  placeholder?: string;
  helpText?: string;
  secretKeys?: string[];
  variableKeys?: string[];
  size?: 'sm' | 'default';
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
}

export default function ReferenceField({
  label,
  value,
  onChange,
  readOnly,
  disabled,
  placeholder,
  helpText,
  secretKeys = [],
  variableKeys = [],
  size = 'sm',
  onFocus,
  onBlur,
}: ReferenceFieldProps) {
  const normalized = useMemo(() => normalizeReferenceValue(value), [value]);
  const [rawValue, setRawValue] = useState<ReferenceConfigValue>(normalized);
  const [sourceType, setSourceType] = useState<ReferenceSourceType>(() => inferReferenceSource(normalized));
  const reference = useMemo(() => readReferenceValue(rawValue), [rawValue]);
  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    setRawValue(normalized);
  }, [normalized]);

  useEffect(() => {
    setSourceType(inferReferenceSource(rawValue));
  }, [rawValue]);

  const handleValueChange = useCallback(
    (next: string) => {
      setRawValue((prev) => {
        const nextRaw = writeReferenceValue(prev, next, sourceType);
        onChange(nextRaw);
        return nextRaw;
      });
    },
    [onChange, sourceType],
  );

  const handleSourceTypeChange = useCallback(
    (nextType: ReferenceSourceType) => {
      setSourceType(nextType);
      setRawValue((prev) => {
        const nextRaw = encodeReferenceValue(nextType, '', prev);
        onChange(nextRaw);
        return nextRaw;
      });
    },
    [onChange],
  );

  const computedPlaceholder = useMemo(() => {
    if (placeholder) return placeholder;
    if (sourceType === 'secret') return 'mount/path/key';
    if (sourceType === 'variable') return 'VARIABLE_NAME';
    return '';
  }, [placeholder, sourceType]);

  return (
    <div className="space-y-1">
      {label ? <Label className="text-xs">{label}</Label> : null}
      <ReferenceInput
        value={reference.value}
        onChange={(event) => handleValueChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        disabled={isDisabled}
        readOnly={readOnly}
        placeholder={computedPlaceholder}
        sourceType={sourceType}
        onSourceTypeChange={handleSourceTypeChange}
        secretKeys={secretKeys}
        variableKeys={variableKeys}
        size={size}
        className="text-xs"
      />
      {!helpText ? null : <div className="text-[10px] text-muted-foreground">{helpText}</div>}
    </div>
  );
}
