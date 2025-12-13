import { useCallback, type ChangeEvent, type InputHTMLAttributes } from 'react';

import { Input } from '@/components/Input';

import { Field, type FieldProps } from './Field';

export interface NumberFieldProps extends Omit<FieldProps, 'children'> {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'size'>;
}

export function NumberField({
  label,
  hint,
  required,
  description,
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  disabled,
  inputProps,
}: NumberFieldProps) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      if (raw === '') {
        onChange(undefined);
        return;
      }
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) {
        return;
      }
      onChange(parsed);
    },
    [onChange],
  );

  return (
    <Field label={label} hint={hint} required={required} description={description}>
      <Input
        type="number"
        size="sm"
        value={value ?? ''}
        onChange={handleChange}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        {...inputProps}
      />
    </Field>
  );
}
