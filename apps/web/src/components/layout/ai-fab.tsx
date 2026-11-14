'use client';

import { aiFabLabel } from '@fatia/api-client';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { useAiDrawer } from './ai-drawer';
import { aiLocked, aiUsable, useAiPendingCount, useChatAvailability } from './use-ai-state';

/**
 * O botão redondo da IA, à direita da barra (prancha `Al-H6c5`). Abre o menu
 * "O que vamos registrar?" e mostra o estado da IA (`Al-H6c8`): anel girando
 * com conversa pensando e selo com quantas esperam a pessoa. Anel e selo são
 * visuais; o nome acessível diz o mesmo (`aiFabLabel`). Com "reduzir
 * movimento" o anel fica parado, inteiro, em vez de girar.
 */
export function AiFab({ className }: { className?: string }) {
  const drawer = useAiDrawer();
  const availability = useChatAvailability().data;
  const usable = aiUsable(availability);
  const pending = useAiPendingCount(usable).data;
  const state = { thinking: (pending?.thinking ?? 0) > 0, waiting: pending?.waiting ?? 0 };
  const label = aiFabLabel(state, { locked: aiLocked(availability) });

  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={drawer.isOpen}
      onClick={drawer.open}
      className={cn(
        'anim-press relative flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_24px_-6px_hsl(var(--primary)/0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      {state.thinking && (
        <span
          aria-hidden
          data-testid="ai-fab-ring"
          className="ai-fab-ring pointer-events-none absolute -inset-1.5 rounded-full border-[2.5px] border-transparent border-r-primary border-t-primary"
        />
      )}
      <Icon name="spark" size={28} />
      {state.waiting > 0 && (
        <span
          aria-hidden
          data-testid="ai-fab-badge"
          className="anim-pop absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-foreground px-1.5 text-xs font-extrabold text-background shadow-[0_0_0_3px_hsl(var(--background))]"
        >
          {state.waiting}
        </span>
      )}
    </button>
  );
}
