'use client';

import type { ComponentProps, ReactNode } from 'react';
import { PauseIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { field } from './surfaces';

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
  action,
  className,
  ...props
}: Omit<ComponentProps<'span'>, 'children' | 'reason'> & {
  /** Por que parou, já em português — ex.: "resposta interrompida". */
  reason: string;
  /** A ação dentro da linha, à direita (o "Continuar" da prancha Al-M11). */
  action?: ReactNode;
}) {
  return (
    <span
      data-slot="stopped-run"
      className={cn(
        field,
        // A linha da prancha IA-Estados ("Pausa e interrompida"): pílula cinza da largura toda.
        'fade-in animate-in flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-[13.5px] text-foreground/65 duration-300 motion-reduce:animate-none',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground/[0.08] text-foreground/55"
      >
        <PauseIcon className="size-3.5" />
      </span>
      <span className="flex-1">{reason}</span>
      {action}
    </span>
  );
}
