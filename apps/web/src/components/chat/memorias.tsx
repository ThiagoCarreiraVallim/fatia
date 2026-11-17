'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, Trash2 } from 'lucide-react';
import {
  MEMORIES_COPY,
  MEMORY_LIMIT,
  deleteChatMemory,
  forgetAllChatMemories,
  listChatMemories,
  memoryCountLabel,
  memoryMeta,
  type ChatMemory,
} from '@fatia/api-client';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { ghostButton } from '@/components/elements/surfaces';
import { CHAVE_DAS_MEMORIAS } from './chat-runtime-provider';
import { CHAVE_DA_CONFIG_DA_IA } from './config-da-ia';

/**
 * O que o assistente guardou sobre a pessoa, com o apagar à mão.
 *
 * Guardar só acontece pelo chat, e com confirmação (`save_memory` é confirmável,
 * ADR 022). Esquecer pode ser pelo chat ou aqui — aqui sem cartão, porque o
 * toque duplo já é a confirmação, como na gaveta de conversas.
 */

function Item({ memoria }: { memoria: ChatMemory }) {
  const queryClient = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);
  const esquecer = useMutation({
    mutationFn: () => deleteChatMemory(memoria.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHAVE_DAS_MEMORIAS });
      void queryClient.invalidateQueries({ queryKey: CHAVE_DA_CONFIG_DA_IA });
    },
  });

  return (
    <li className="flex items-start gap-2 rounded-lg px-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{memoria.content}</p>
        <p className="text-xs text-muted-foreground">{memoryMeta(memoria)}</p>
      </div>
      <button
        type="button"
        aria-label={confirmando ? 'Confirmar: esquecer' : `Esquecer: ${memoria.content}`}
        disabled={esquecer.isPending}
        onClick={() => (confirmando ? esquecer.mutate() : setConfirmando(true))}
        onBlur={() => setConfirmando(false)}
        className={cn(
          ghostButton,
          'shrink-0 rounded p-1.5',
          confirmando ? 'text-danger' : 'text-foreground/50',
        )}
      >
        {confirmando ? (
          <span className="text-xs font-semibold">Esquecer?</span>
        ) : (
          <Trash2 size={14} aria-hidden />
        )}
      </button>
    </li>
  );
}

function ApagarTodas() {
  const queryClient = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);
  const apagar = useMutation({
    mutationFn: forgetAllChatMemories,
    onSuccess: () => {
      setConfirmando(false);
      void queryClient.invalidateQueries({ queryKey: CHAVE_DAS_MEMORIAS });
      void queryClient.invalidateQueries({ queryKey: CHAVE_DA_CONFIG_DA_IA });
    },
  });
  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className={cn(ghostButton, 'self-start rounded-full px-4 py-2 text-sm text-danger')}
      >
        {MEMORIES_COPY.deleteAll}
      </button>
    );
  }
  return (
    <div
      role="alertdialog"
      aria-label={MEMORIES_COPY.deleteAllTitle}
      className="flex flex-col gap-2"
    >
      <p className="text-sm font-semibold text-foreground">{MEMORIES_COPY.deleteAllTitle}</p>
      <p className="text-xs text-muted-foreground">{MEMORIES_COPY.deleteAllBody}</p>
      {apagar.isError ? (
        <p role="alert" className="text-xs text-danger">
          Não consegui apagar agora. Tente de novo.
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          aria-label="Confirmar: apagar todas"
          disabled={apagar.isPending}
          onClick={() => apagar.mutate()}
          className="rounded-full bg-danger px-4 py-2 text-sm font-semibold text-white"
        >
          {MEMORIES_COPY.deleteAllConfirm}
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className={cn(ghostButton, 'rounded-full px-4 py-2 text-sm')}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/**
 * O que a IA lembra (prancha Al-M9): cada memória com categoria e data, o "n de 50", o aviso de
 * que a equipe não vê e o "Apagar todas" com confirmação. `aberta`/`onAberta` deixam a Config da
 * IA abrir esta gaveta pelo atalho "O que a IA lembra".
 */
export function GavetaDeMemorias({
  aberta,
  onAberta,
}: { aberta?: boolean; onAberta?: (aberta: boolean) => void } = {}) {
  const [interna, setInterna] = useState(false);
  const visivel = aberta ?? interna;
  const setVisivel = onAberta ?? setInterna;
  const {
    data: memorias = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: CHAVE_DAS_MEMORIAS,
    queryFn: listChatMemories,
    enabled: visivel,
  });
  const uso = Math.min(1, memorias.length / MEMORY_LIMIT);

  return (
    <Drawer open={visivel} onOpenChange={setVisivel}>
      <DrawerTrigger
        aria-label={MEMORIES_COPY.title}
        className={cn(ghostButton, 'rounded-full p-2 text-foreground/70')}
      >
        <Brain size={20} aria-hidden />
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle>{MEMORIES_COPY.title}</DrawerTitle>
          <DrawerDescription>{MEMORIES_COPY.intro}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-8">
          {isLoading ? (
            <p className="py-4 text-sm text-muted-foreground">Carregando…</p>
          ) : isError ? (
            <p className="py-4 text-sm text-muted-foreground">Não deu para carregar agora.</p>
          ) : (
            <>
              <section className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-foreground/70">{MEMORIES_COPY.saved}</span>
                  <span className="font-semibold text-foreground">
                    {memoryCountLabel(memorias.length)}
                  </span>
                </div>
                <div
                  aria-hidden
                  className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]"
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round(uso * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{MEMORIES_COPY.limitNote}</p>
              </section>
              {memorias.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-sm font-semibold text-foreground">
                    {MEMORIES_COPY.emptyTitle}
                  </p>
                  <p className="text-xs text-muted-foreground">{MEMORIES_COPY.emptyBody}</p>
                </div>
              ) : (
                <ul aria-label="Memórias" className="-mx-2">
                  {memorias.map((memoria) => (
                    <Item key={memoria.id} memoria={memoria} />
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">{MEMORIES_COPY.teamNote}</p>
              {memorias.length > 0 ? <ApagarTodas /> : null}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
