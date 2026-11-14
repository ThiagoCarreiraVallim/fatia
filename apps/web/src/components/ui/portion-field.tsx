'use client';

import { formatQuantity, gramsFor, stepQuantity } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { Icon } from './icon';

/**
 * Campo de porção (prancha Componentes · Campos: "1½ = 37,5 g"). Usa as regras
 * de porção do api-client (passos de ½, limites, frações) — as mesmas do app.
 */
export function PortionField({
  quantity,
  portionGrams,
  onChange,
  label,
  className,
}: {
  quantity: number;
  portionGrams: number;
  onChange: (quantity: number) => void;
  /** O nome da porção, para o leitor de tela ("colher de sopa"). */
  label: string;
  className?: string;
}) {
  const grams = gramsFor(portionGrams, quantity);
  return (
    <div className={cn('flex items-center gap-1.5 rounded-field bg-muted p-1', className)}>
      <button
        type="button"
        aria-label={`Menos ${label}`}
        onClick={() => onChange(stepQuantity(quantity, -1))}
        className="anim-press flex h-11 w-11 items-center justify-center rounded-[12px] bg-card"
      >
        <span aria-hidden className="font-display text-xl font-bold leading-none">
          −
        </span>
      </button>
      <output
        aria-live="polite"
        aria-label={`${formatQuantity(quantity)} ${label}, ${grams.toLocaleString('pt-BR')} g`}
        className="min-w-14 flex-1 text-center font-display text-lg font-bold tabular-nums"
      >
        {formatQuantity(quantity)}
      </output>
      <button
        type="button"
        aria-label={`Mais ${label}`}
        onClick={() => onChange(stepQuantity(quantity, 1))}
        className="anim-press flex h-11 w-11 items-center justify-center rounded-[12px] bg-primary text-primary-foreground"
      >
        <Icon name="plus" size={20} />
      </button>
      <span className="ml-auto pr-3 text-[13px] text-muted-foreground tabular-nums">
        = {grams.toLocaleString('pt-BR')} g
      </span>
    </div>
  );
}
