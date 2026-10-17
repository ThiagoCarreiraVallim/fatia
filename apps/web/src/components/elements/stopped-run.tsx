'use client';

import type { ComponentProps } from 'react';
import { SquareIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { field, mono } from './surfaces';

/**
 * `elements-stopped-run` do assistant-ui, reduzido à etiqueta.
 *
 * Resolve uma mentira de tela: uma resposta cortada porque a pessoa apertou
 * "parar" ficava **idêntica** a uma que terminou. Quem lê "seu almoço teve 42 g
 * de" não tinha como saber se o resto não veio ou se não havia resto.
 *
 * Ficaram de fora o texto (`words`), porque o corpo já está na tela pelo
 * `streamdown`, com o markdown intacto; "Continue", porque não existe
 * continuação de turno — pedir de novo é mandar outra mensagem; e "Discard",
 * porque o pedaço que chegou **já está gravado**: a pessoa o leu, e sumir com ele
 * só da tela faria o histórico voltar, no F5, com o que ela mandou apagar.
 */

export function StoppedRun({
  reason,
  className,
  ...props
}: Omit<ComponentProps<'span'>, 'children' | 'reason'> & {
  /** Por que parou, já em português — ex.: "resposta interrompida". */
  reason: string;
}) {
  return (
    <span
      data-slot="stopped-run"
      className={cn(
        field,
        mono,
        'fade-in animate-in inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-foreground/45 duration-300 motion-reduce:animate-none',
        className,
      )}
      {...props}
    >
      <SquareIcon aria-hidden className="size-2.5 fill-current" />
      {reason}
    </span>
  );
}
