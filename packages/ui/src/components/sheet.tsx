"use client";

import * as React from 'react';
import { Dialog, DialogContent, DialogOverlay, DialogPortal, DialogTitle, DialogDescription, DialogTrigger, DialogClose } from './dialog';
import { cn } from '../utils/cn';

type Side = 'top' | 'bottom' | 'left' | 'right';

const Sheet = Dialog;
const SheetTrigger = DialogTrigger;
const SheetClose = DialogClose;

function SheetContent({ side = 'right', className, children, ...props }: React.ComponentProps<typeof DialogContent> & { side?: Side }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogContent
        className={cn(
          'fixed z-50 gap-0 border bg-background p-0 shadow-lg',
          side === 'right' && 'inset-y-0 right-0 h-full w-3/4 max-w-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
          side === 'left' && 'inset-y-0 left-0 h-full w-3/4 max-w-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left',
          side === 'top' && 'inset-x-0 top-0 h-1/2 max-h-[80vh] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top',
          side === 'bottom' && 'inset-x-0 bottom-0 h-1/2 max-h-[80vh] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
          className
        )}
        {...props}
      >
        {children}
      </DialogContent>
    </DialogPortal>
  );
}

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('px-6 py-4 border-b', className)} {...props} />
);
const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('px-6 py-4 border-t flex items-center justify-end gap-2', className)} {...props} />
);
const SheetTitle = DialogTitle;
const SheetDescription = DialogDescription;

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription };

