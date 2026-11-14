'use client';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * O botão redondo da IA (68 px) no centro da barra (ADR 040 revisada). Verde
 * da marca, ícone escuro; respira devagar (`anim-breathe`), parado com
 * reduzir movimento. Nunca leva a cor da comunidade.
 */
export function AiButton({
  onClick,
  label = 'Falar com a IA',
  className,
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'anim-press anim-breathe flex h-[68px] w-[68px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_30px_-10px_hsl(var(--primary)/0.7)] ring-4 ring-background',
        className,
      )}
    >
      <Icon name="spark" size={28} />
    </button>
  );
}
