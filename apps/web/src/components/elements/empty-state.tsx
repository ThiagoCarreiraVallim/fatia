'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { paper } from './surfaces';

/**
 * `elements-empty-state` do assistant-ui.
 *
 * Sem o `EmptyStateComposer` do original: ele desenha uma barra de digitação
 * falsa, que só serve na vitrine da documentação. Aqui embaixo existe o composer
 * de verdade, e dois campos na mesma tela — um deles inerte — mandariam quem
 * chega escrever no lugar errado.
 */

export function EmptyState({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-state"
      className={cn('flex w-full max-w-md flex-col items-center gap-7', className)}
      {...props}
    />
  );
}

export function EmptyStateGreeting({ className, ...props }: ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="empty-state-greeting"
      className={cn(
        'fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-center text-2xl font-medium tracking-tight duration-500 motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

export function EmptyStateSuggestions({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-state-suggestions"
      className={cn('flex flex-wrap justify-center gap-2', className)}
      {...props}
    />
  );
}

export function EmptyStateSuggestion({
  index = 0,
  className,
  style,
  ...props
}: ComponentProps<'button'> & { index?: number }) {
  return (
    <button
      type="button"
      data-slot="empty-state-suggestion"
      style={{ animationDelay: `${120 + index * 70}ms`, ...style }}
      className={cn(
        paper,
        'fade-in slide-in-from-bottom-2 animate-in fill-mode-both focus-visible:ring-foreground/20 rounded-full px-4 py-2 text-[13px] transition-transform duration-500 outline-none hover:-translate-y-px focus-visible:ring-2 active:scale-[0.96] motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}
