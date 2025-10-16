import * as React from 'react';
import { cn } from '../utils/cn';

export interface LogoWordmarkProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'dark' | 'gradient';
}

export function LogoWordmark({ className, variant = 'primary', ...props }: LogoWordmarkProps) {
  const variantClass =
    variant === 'gradient'
      ? 'bg-[--gradient-primary] bg-clip-text text-transparent'
      : variant === 'dark'
      ? 'text-white'
      : 'text-foreground';
  return (
    <span className={cn('tracking-[-0.02em] font-bold', variantClass, className)} {...props}>
      agyn
    </span>
  );
}

