'use client';

import { Toaster as Sonner } from 'sonner';
import { duration as motion } from '@fatia/design';
import { useThemePreference } from '@/lib/theme-preference';

/**
 * Avisos curtos (`toast()` do `sonner`), como o "Apagado · Desfazer" dos
 * registros pequenos. Cai do topo com mola (prancha Movimento · Toast), fundo
 * claro sobre o escuro (e o contrário no claro), e some em 2,5 s; com ação
 * ("Desfazer") fica 5 s (`toastDuration`), porque 2,5 s não dá para ler e
 * alcançar o botão (WCAG 2.2.1). O `sonner` já anuncia em região viva.
 */
export function Toaster() {
  const { theme } = useThemePreference();
  return (
    <Sonner
      theme={theme}
      position="top-center"
      duration={motion.toast}
      offset={16}
      mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
      toastOptions={{
        classNames: {
          toast:
            'anim-toast !rounded-field !border-0 !bg-foreground !text-background !font-bold !text-sm !shadow-[0_16px_30px_-12px_rgba(0,0,0,0.7)]',
          actionButton: '!bg-transparent !font-bold !text-background !underline',
        },
      }}
    />
  );
}

/** Quanto o toast fica: 2,5 s sem ação, 5 s com "Desfazer". */
export function toastDuration(hasAction: boolean): number {
  return hasAction ? motion.toastWithAction : motion.toast;
}
