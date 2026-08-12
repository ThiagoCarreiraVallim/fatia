'use client';

import { AlertCircleIcon, CheckIcon, ChevronRightIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { collapsePanel, field, mono, SwapLabel } from './surfaces';

/**
 * `elements-tool-call` do assistant-ui, com três desvios do original.
 *
 * **1. O estado de falha existe.** O element traz `running: boolean` — tool ou
 * está rodando ou deu certo. O `/mcp` do Fatia tem um terceiro caso, e é o que
 * mais importa aparecer: `output-error`. Sem ele, uma consulta que falhou ficava
 * indistinguível de uma que respondeu, e quem conversa acharia que o número que
 * o modelo disse veio dos dados.
 *
 * **2. Os seletores são do Radix.** O original usa `group-data-open` e
 * `group-data-panel-open`, que são do Base UI; o collapsible daqui é Radix, que
 * marca `data-state="open"`. Com o seletor errado a seta simplesmente não gira.
 *
 * **3. Em português**, como o resto da tela.
 */

export type ToolCallState = 'running' | 'done' | 'error';

export interface ToolCallProps {
  /** Rótulo quando terminou, ex.: "Consultou". */
  label: string;
  /** Rótulo enquanto roda — é ele que recebe o shimmer. */
  activeLabel: string;
  /** Rótulo quando falhou. */
  errorLabel: string;
  /** O que vai na etiqueta monoespaçada: aqui, o nome da tool no catálogo MCP. */
  query: string;
  request: string;
  result: string;
  state: ToolCallState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

/** `SwapLabel` recebe exatamente dois filhos, então o rótulo visível é escolhido antes. */
function rotuloDoEstado(props: Pick<ToolCallProps, 'label' | 'errorLabel' | 'state'>): string {
  if (props.state === 'error') return props.errorLabel;
  return props.label;
}

export function ToolCall({
  label,
  activeLabel,
  errorLabel,
  query,
  request,
  result,
  state,
  open,
  onOpenChange,
  className,
}: ToolCallProps) {
  const running = state === 'running';
  const falhou = state === 'error';

  return (
    <Collapsible
      data-slot="tool-call"
      data-state-tool={state}
      open={open}
      onOpenChange={onOpenChange}
      className={cn('w-full max-w-sm', className)}
    >
      <CollapsibleTrigger className="group/trigger flex items-center gap-2 rounded-md py-1 text-[13.5px] text-foreground/55 outline-none transition-colors hover:text-foreground/90">
        <ChevronRightIcon className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-[state=open]/trigger:rotate-90 motion-reduce:transition-none" />
        <SwapLabel active={running ? 0 : 1} className="text-start">
          <span className="relative inline-block leading-none">
            <span>{activeLabel}</span>
            <span
              aria-hidden
              className="shimmer pointer-events-none absolute inset-0 motion-reduce:animate-none"
            >
              {activeLabel}
            </span>
          </span>
          <>{rotuloDoEstado({ label, errorLabel, state })}</>
        </SwapLabel>
        <span
          className={cn(mono, 'rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-foreground/70')}
        >
          {query}
        </span>
        <span className="ms-auto flex w-4 items-center justify-end">
          {state === 'done' && (
            <CheckIcon className="fade-in zoom-in-90 animate-in size-3.5 text-emerald-500 duration-200" />
          )}
          {falhou && (
            <AlertCircleIcon className="fade-in zoom-in-90 animate-in size-3.5 text-red-500 duration-200" />
          )}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className={cn(collapsePanel, 'outline-none')}>
        <div className={cn(field, 'mt-2 overflow-hidden rounded-2xl text-xs')}>
          <div className="px-3.5 pb-2 pt-2.5">
            <p className={cn(mono, 'mb-1 text-foreground/35')}>Chamada</p>
            <p className="whitespace-pre-wrap break-words font-mono text-foreground/55">
              {request}
            </p>
          </div>
          <div className="mx-3.5 h-px bg-foreground/[0.06]" />
          <div className="px-3.5 pb-2.5 pt-2">
            <p className={cn(mono, 'mb-1 text-foreground/35')}>{falhou ? 'Erro' : 'Resposta'}</p>
            <p
              className={cn(
                'whitespace-pre-wrap break-words',
                falhou ? 'text-red-400' : 'text-foreground/90',
              )}
            >
              {result}
            </p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
