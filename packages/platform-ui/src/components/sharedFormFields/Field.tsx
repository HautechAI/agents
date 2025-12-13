import type { ReactNode } from 'react';

import { FieldLabel } from '@/components/nodeProperties/FieldLabel';

export interface FieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  description?: ReactNode;
  children: ReactNode;
}

export function Field({ label, hint, required, description, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <FieldLabel label={label} hint={hint} required={required} />
      {children}
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}
