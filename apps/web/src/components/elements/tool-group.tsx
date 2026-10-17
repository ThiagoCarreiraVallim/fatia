'use client';

import { useState, type ReactNode } from 'react';
import { ChevronRightIcon } from 'lucide-react';
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
 * Aberto por padrão quando `defaultOpen`: quem chama abre o grupo que ainda está
 * rodando ou que tem cartão (a folha do dia, o gráfico), porque esconder o cartão
 * atrás de um toque esconderia o resultado.
 */
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
  return (
    <Collapsible
      data-slot="tool-group"
      open={open}
      onOpenChange={setOpen}
      className={cn('w-full', className)}
    >
      <CollapsibleTrigger className="group/trigger flex items-center gap-2 rounded-md py-1 text-[13.5px] text-foreground/55 outline-none transition-colors hover:text-foreground/90">
        <ChevronRightIcon
          aria-hidden
          className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 group-data-[state=open]/trigger:rotate-90 motion-reduce:transition-none"
        />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-1 pl-5 outline-none">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
