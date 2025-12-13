import type { ReactNode } from 'react';

interface SectionProps {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  spacing?: string;
}

export function Section({ title, description, children, spacing = 'space-y-4' }: SectionProps) {
  return (
    <section className="space-y-4">
      {title ? <h3 className="text-[var(--agyn-dark)] font-semibold">{title}</h3> : null}
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      <div className={spacing}>{children}</div>
    </section>
  );
}
