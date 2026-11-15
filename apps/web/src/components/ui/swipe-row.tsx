'use client';

import * as React from 'react';
import { swipeSettle } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { Icon } from './icon';

const ACTION_WIDTH = 88;

export interface SwipeAction {
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
}

/**
 * Linha de lista com swipe (prancha Componentes · Listas): arrastar para a
 * esquerda revela Editar/Apagar, e some o lixo fixo em cada linha.
 *
 * Gesto nunca é o único caminho: o botão "Mais ações" (teclado, leitor de tela,
 * mouse) abre as mesmas ações, e Esc fecha.
 */
export function SwipeRow({
  children,
  actions,
  label,
  className,
}: {
  children: React.ReactNode;
  actions: SwipeAction[];
  /** O objeto da linha, para nomear o botão ("Mais ações: Café da manhã"). */
  label: string;
  className?: string;
}) {
  const full = actions.length * ACTION_WIDTH;
  const [offset, setOffset] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const start = React.useRef<{ x: number; base: number } | null>(null);
  const open = offset !== 0;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    start.current = { x: e.clientX, base: offset };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const next = Math.min(0, Math.max(-full, start.current.base + e.clientX - start.current.x));
    setOffset(next);
  };
  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    setOffset((o) => swipeSettle(o, full));
  };

  return (
    <div
      className={cn('relative overflow-hidden', className)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) setOffset(0);
      }}
    >
      <div className="absolute inset-y-0 right-0 flex" aria-hidden={!open}>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              setOffset(0);
              a.onPress();
            }}
            style={{ width: ACTION_WIDTH }}
            className={cn(
              'text-sm font-bold',
              a.tone === 'danger'
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-surface-3 text-foreground',
            )}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div
        className={cn(
          'relative flex min-h-[60px] touch-pan-y items-center gap-3.5 bg-card py-3.5 pl-[18px] pr-2',
          !dragging && 'transition-transform duration-base ease-ds motion-reduce:transition-none',
        )}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          aria-label={`Mais ações: ${label}`}
          aria-expanded={open}
          onClick={() => setOffset(open ? 0 : -full)}
          className="alvo-toque flex h-9 w-9 shrink-0 items-center justify-center rounded-chip text-faint hover:text-foreground"
        >
          <Icon name="more" size={20} />
        </button>
      </div>
    </div>
  );
}
