import { useCallback, type ChangeEvent, type TextareaHTMLAttributes } from 'react';

import { Textarea } from '@/components/Textarea';

import { Field, type FieldProps } from './Field';

export interface TextAreaFieldProps extends Omit<FieldProps, 'children'> {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  textareaProps?: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>;
}

export function TextAreaField({
  label,
  hint,
  required,
  description,
  value,
  onChange,
  placeholder,
  rows,
  disabled,
  textareaProps,
}: TextAreaFieldProps) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onChange?.(event.target.value);
    },
    [onChange],
  );

  return (
    <Field label={label} hint={hint} required={required} description={description}>
      <Textarea
        value={value ?? ''}
        onChange={handleChange}
        placeholder={placeholder}
        rows={rows}
        size="sm"
        disabled={disabled}
        {...textareaProps}
      />
    </Field>
  );
}
