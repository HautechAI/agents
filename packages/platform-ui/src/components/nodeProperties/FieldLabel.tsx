import { Info } from 'lucide-react';

interface FieldLabelProps {
  label: string;
  hint?: string;
  required?: boolean;
}

export function FieldLabel({ label, hint, required }: FieldLabelProps) {
  return (
    <div className="flex items-center gap-1 mb-2">
      <label className="text-sm text-[var(--agyn-dark)]">
        {label}
        {required && <span className="text-[var(--agyn-status-failed)]">*</span>}
      </label>
      {hint && (
        <span className="cursor-help" aria-label={hint} title={hint} role="img">
          <Info className="w-3.5 h-3.5 text-[var(--agyn-gray)]" aria-hidden="true" />
        </span>
      )}
    </div>
  );
}
