"use client";

import * as React from 'react';
import { Drawer as VaulDrawer } from 'vaul';
import { cn } from '../utils/cn';

const Drawer = VaulDrawer.Root;
const DrawerTrigger = VaulDrawer.Trigger;
const DrawerPortal = VaulDrawer.Portal;
const DrawerClose = VaulDrawer.Close;

function DrawerOverlay({ className, ...props }: React.ComponentProps<typeof VaulDrawer.Overlay>) {
  return <VaulDrawer.Overlay className={cn('fixed inset-0 z-50 bg-black/50', className)} {...props} />;
}

function DrawerContent({ className, children, ...props }: React.ComponentProps<typeof VaulDrawer.Content>) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <VaulDrawer.Content className={cn('fixed inset-x-0 bottom-0 z-50 mt-24 rounded-t-[10px] border bg-background shadow-lg', className)} {...props}>
        <div className="mx-auto mt-4 h-1.5 w-12 rounded-full bg-muted" />
        <div className="p-6">{children}</div>
      </VaulDrawer.Content>
    </DrawerPortal>
  );
}

export { Drawer, DrawerTrigger, DrawerContent, DrawerPortal, DrawerClose };

