import { Dropdown } from '@/components/Dropdown';

import { Field, type FieldProps } from './Field';

export interface SelectFieldOption {
  value: string;
  label: string;
}

export interface SelectFieldProps extends Omit<FieldProps, 'children'> {
  value?: string;
  onChange?: (value: string) => void;
  options: SelectFieldOption[];
  placeholder?: string;
  disabled?: boolean;
  size?: 'sm' | 'default';
}

export function SelectField({
  label,
  hint,
  required,
  description,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  size = 'sm',
}: SelectFieldProps) {
  return (
    <Field label={label} hint={hint} required={required} description={description}>
      <Dropdown
        value={value}
        onValueChange={onChange}
        options={options}
        placeholder={placeholder}
        size={size}
        disabled={disabled}
      />
    </Field>
  );
}
