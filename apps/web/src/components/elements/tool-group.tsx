'use client';

import { useState, type ReactNode } from 'react';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

/**
 * `elements-tool-group` do assistant-ui, com seletores do Radix e rótulo por prop.
 *
 * O que ele resolve: uma pergunta que consulta cinco coisas empilhava cinco
 * linhas de status antes da resposta, e no celular a resposta ia para baixo da
 * dobra. O cabeçalho resume; as linhas continuam lá, iguais, para quem abrir — é
 * a auditoria do que o assistente fez, e ela não some.
 *
 * Aberto quando `defaultOpen`: quem chama abre o grupo que traz um cartão que pede a pessoa
 * (o "Gravado" com Desfazer, o "abrir no app"). Ao vivo, o grupo nasce antes do cartão chegar:
 * `defaultOpen` que vira `true` depois abre o grupo, e quem fechar à mão continua no comando.
 */
/** "Consultei 3 coisas" com a contagem em destaque, como na prancha IA-Estados. */
function destaque(label: string) {
  const m = /^(\D*)(\d.*)$/.exec(label);
  if (!m) return label;
  return (
    <>
      {m[1]}
      <span className="font-semibold text-foreground">{m[2]}</span>
    </>
  );
}

export function ToolGroup({
  label,
  defaultOpen = false,
  children,
  className,
}: {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Ajuste no render, não em efeito: o cartão que chegou abre o grupo no mesmo quadro.
  const [pediuAntes, setPediuAntes] = useState(defaultOpen);
  if (defaultOpen !== pediuAntes) {
    setPediuAntes(defaultOpen);
    if (defaultOpen) setOpen(true);
  }
  return (
    <Collapsible
      data-slot="tool-group"
      open={open}
      onOpenChange={setOpen}
      className={cn('w-full', className)}
    >
      <CollapsibleTrigger className="group/trigger flex w-full items-center gap-2.5 rounded-2xl bg-foreground/[0.04] px-3 py-2.5 text-start text-[13.5px] text-foreground/65 outline-none transition-colors hover:text-foreground/90 focus-visible:ring-2 focus-visible:ring-foreground/20 dark:bg-foreground/[0.06]">
        <span
          aria-hidden
          className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-success"
        >
          <CheckIcon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate">{destaque(label)}</span>
        <ChevronDownIcon
          aria-hidden
          className="size-4 shrink-0 opacity-60 transition-transform duration-200 group-data-[state=open]/trigger:rotate-180 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 flex flex-col gap-2 outline-none">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
