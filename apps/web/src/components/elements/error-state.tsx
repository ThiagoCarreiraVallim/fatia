'use client';

import type { ComponentProps } from 'react';
import { CircleAlertIcon, RefreshCwIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * `elements-error-state` do assistant-ui, em português.
 *
 * O `role="alert"` é do original e é o motivo de ele servir aqui: erro de chat é
 * interrupção, e precisa chegar a quem usa leitor de tela mesmo com o foco no
 * campo de texto — o `role="log"` da conversa está calado de propósito.
 *
 * O ramo `retrying` do original foi retirado. Ele mostra "Retrying" no lugar do
 * aviso, e neste app esse estado não existe: `useChatStream.retry` limpa o erro
 * e o balão passa a mostrar o `ThinkingIndicator`, que é o mesmo retorno visual
 * de qualquer resposta em curso. Um ramo que nenhum estado alcança é pior que um
 * ramo a menos — ele passa a impressão de estar coberto.
 */

export interface ErrorStateProps extends Omit<ComponentProps<'div'>, 'children' | 'role'> {
  title: string;
  detail: string;
  retryLabel: string;
  onRetry: () => void;
}

export function ErrorState({
  title,
  detail,
  retryLabel,
  onRetry,
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      data-slot="error-state"
      role="alert"
      className={cn(
        'fade-in animate-in flex w-full max-w-sm items-start gap-2.5 rounded-2xl bg-red-500/[0.06] px-4 py-3 text-sm duration-300 motion-reduce:animate-none dark:bg-red-500/10',
        className,
      )}
      {...props}
    >
      <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-red-500/80" />
      <div className="min-w-0">
        <p className="font-medium text-red-600 dark:text-red-400">{title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-red-600/60 dark:text-red-400/60">
          {detail}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="ms-auto flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
      >
        <RefreshCwIcon className="size-3" />
        {retryLabel}
      </button>
    </div>
  );
}
