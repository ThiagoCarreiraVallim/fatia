'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import type { TimingStat } from '@/components/chat/turn-timing';
import { mono } from './surfaces';

/**
 * `elements-message-timing` do assistant-ui, sem desvio de forma.
 *
 * `stats` chega pronto de fora, rótulo e valor, então não há uma palavra a
 * traduzir aqui dentro. A regra que quem monta `stats` tem de seguir — medida
 * ausente não vira zero — mora em `chat/turn-timing.ts`.
 */
export function MessageTiming({
  stats,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'children'> & { stats: readonly TimingStat[] }) {
  if (stats.length === 0) return null;
  return (
    <div
      data-slot="message-timing"
      className={cn(
        'fade-in animate-in flex w-full max-w-sm flex-wrap items-center gap-x-3 gap-y-1 duration-500 motion-reduce:animate-none',
        className,
      )}
      {...props}
    >
      {stats.map((stat) => (
        <span key={stat.label} className="flex items-baseline gap-1">
          <span className={cn(mono, 'text-foreground/35')}>{stat.label}</span>
          <span className={cn(mono, 'tabular-nums text-foreground/50')}>{stat.value}</span>
        </span>
      ))}
    </div>
  );
}
