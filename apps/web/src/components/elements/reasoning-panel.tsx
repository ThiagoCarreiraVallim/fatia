'use client';

import { BrainIcon, ChevronRightIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { field } from './surfaces';

/**
 * `elements-reasoning` do assistant-ui, com seletores do Radix (`data-state`) e
 * rótulos em português por prop.
 *
 * **Colapsado por padrão, e é o ponto.** O raciocínio do modelo é longo e cru —
 * centenas de pedaços antes de uma resposta de duas linhas. Aberto, empurraria a
 * resposta para fora da tela do celular a cada turno. O que a pessoa precisa ver
 * é que algo está acontecendo; o conteúdo é para quem for procurar.
 */
export function ReasoningPanel({
  text,
  streaming,
  activeLabel,
  label,
  className,
}: {
  /** O raciocínio recebido até agora. */
  text: string;
  /** Ainda chegando: o rótulo diz que está pensando. */
  streaming: boolean;
  /** Rótulo enquanto pensa. */
  activeLabel: string;
  /** Rótulo depois que terminou. */
  label: string;
  className?: string;
}) {
  return (
    <Collapsible
      data-slot="reasoning-panel"
      data-streaming={streaming || undefined}
      className={cn('w-full', className)}
    >
      <CollapsibleTrigger className="group/trigger flex items-center gap-2 rounded-md py-1 text-[13.5px] text-foreground/55 outline-none transition-colors hover:text-foreground/90">
        <ChevronRightIcon
          aria-hidden
          className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 group-data-[state=open]/trigger:rotate-90 motion-reduce:transition-none"
        />
        <BrainIcon aria-hidden className="size-3.5 shrink-0 opacity-60" />
        <span className={cn(streaming && 'animate-pulse motion-reduce:animate-none')}>
          {streaming ? activeLabel : label}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="outline-none">
        {/* Teto de altura com rolagem própria: não há corte nenhum no raciocínio,
            é o turno inteiro de pensamento. */}
        <div
          className={cn(
            field,
            'mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed text-foreground/55',
          )}
        >
          {text}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
