"use client";

import * as React from 'react';
import { cn } from '../utils/cn';

function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <kbd className={cn('inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground shadow-xs', className)} {...props} />;
}

export { Kbd };

