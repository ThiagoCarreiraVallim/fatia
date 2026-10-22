'use client';

import { Toaster as Sonner } from 'sonner';

/**
 * Avisos curtos (`toast()` do `sonner`), como o "Apagado · Desfazer" dos
 * registros pequenos. Fica acima da barra de baixo no celular; no desktop, no
 * canto. O `sonner` já anuncia em região viva.
 */
export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
      offset={96}
      mobileOffset={{ bottom: 96 }}
      toastOptions={{
        classNames: {
          toast: 'rounded-xl border border-border bg-popover text-foreground',
          actionButton: '!bg-transparent !font-bold !text-primary',
        },
      }}
    />
  );
}
