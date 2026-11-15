'use client';

import { proBlockCopy, type ProBlockState } from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * Bloco PRO (prancha PRO · 9 estados). O estado vem de `proBlockState` e o
 * texto de `proBlockCopy`, os dois no api-client: a tela só desenha. Fundo
 * do cartão com o verde só no selo; nunca a cor da comunidade.
 */
export function ProBlock({
  state,
  canPurchase = true,
  onAction,
  className,
}: {
  state: ProBlockState;
  canPurchase?: boolean;
  onAction?: () => void;
  className?: string;
}) {
  const copy = proBlockCopy(state, canPurchase);
  return (
    <section
      aria-label="Plano"
      className={cn(
        'flex flex-col gap-3 rounded-card bg-card p-5',
        copy.tone === 'attention' && 'shadow-[inset_0_0_0_1.5px_hsl(var(--warning)/0.6)]',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-field',
            copy.tone === 'attention'
              ? 'bg-[hsl(var(--warning)/0.14)] text-warning'
              : 'bg-primary text-primary-foreground',
          )}
        >
          <Icon name={copy.tone === 'attention' ? 'clock' : 'crown'} size={20} />
        </span>
        <h3 className="font-display text-lg font-bold leading-tight">{copy.title}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{copy.body}</p>
      {copy.action && onAction && (
        <Button
          variant={copy.tone === 'positive' ? 'secondary' : 'default'}
          size="lg"
          onClick={onAction}
        >
          {copy.action}
        </Button>
      )}
    </section>
  );
}

/** A versão de uma linha, para o topo do chat e o Você. */
export function ProBlockCompact({
  state,
  canPurchase = true,
  onAction,
}: {
  state: ProBlockState;
  canPurchase?: boolean;
  onAction?: () => void;
}) {
  const copy = proBlockCopy(state, canPurchase);
  return (
    <div className="flex items-center gap-3 rounded-field bg-card px-4 py-3">
      <Icon name="crown" size={18} className="text-primary-text" />
      <p className="min-w-0 flex-1 truncate text-sm font-semibold">{copy.title}</p>
      {copy.action && onAction && (
        <Button variant="text" size="xs" onClick={onAction}>
          {copy.action}
        </Button>
      )}
    </div>
  );
}
