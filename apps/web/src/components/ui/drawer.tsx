'use client';

import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { cn } from '@/lib/utils';

/**
 * Folha inferior (prancha Componentes · Folha): sobe em 550 ms, arrastar para
 * baixo fecha, ações no fim. No desktop (`md+`) a mesma folha abre como painel
 * lateral de 480 px à direita, em vez de um celular esticado no meio da tela.
 */
const DESKTOP = '(min-width: 768px)';

function subscribeDesktop(onChange: () => void) {
  const media = window.matchMedia?.(DESKTOP);
  media?.addEventListener?.('change', onChange);
  return () => media?.removeEventListener?.('change', onChange);
}

export function useIsDesktop(): boolean {
  return React.useSyncExternalStore(
    subscribeDesktop,
    () => !!window.matchMedia?.(DESKTOP).matches,
    () => false,
  );
}

const Drawer = ({
  shouldScaleBackground = true,
  direction,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => {
  const desktop = useIsDesktop();
  return (
    <DrawerPrimitive.Root
      shouldScaleBackground={desktop ? false : shouldScaleBackground}
      direction={direction ?? (desktop ? 'right' : 'bottom')}
      {...props}
    />
  );
};
Drawer.displayName = 'Drawer';

const DrawerTrigger = DrawerPrimitive.Trigger;
const DrawerPortal = DrawerPrimitive.Portal;
const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-300 motion-reduce:animate-none',
      className,
    )}
    {...props}
  />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto max-h-[92vh] flex-col rounded-t-sheet bg-card shadow-[0_-20px_50px_-20px_rgba(0,0,0,0.8)]',
        // Desktop: painel lateral de 480 px.
        'data-[vaul-drawer-direction=right]:inset-x-auto data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:mt-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:w-[480px] data-[vaul-drawer-direction=right]:max-w-full data-[vaul-drawer-direction=right]:rounded-none data-[vaul-drawer-direction=right]:rounded-l-sheet',
        className,
      )}
      {...props}
    >
      <div
        aria-hidden
        className="mx-auto mt-3 h-[5px] w-10 rounded-full bg-border-strong [[data-vaul-drawer-direction=right]_&]:hidden"
      />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
));
DrawerContent.displayName = 'DrawerContent';

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('grid gap-1.5 p-4 pb-0 text-left', className)} {...props} />
);
DrawerHeader.displayName = 'DrawerHeader';

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />
);
DrawerFooter.displayName = 'DrawerFooter';

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export {
  Drawer,
  DrawerTrigger,
  DrawerPortal,
  DrawerClose,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
