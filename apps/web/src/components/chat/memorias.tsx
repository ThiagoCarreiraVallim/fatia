'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Apple,
  BookOpen,
  Clock,
  Info,
  ShieldCheck,
  Sun,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import {
  MEMORIES_COPY,
  MEMORY_LIMIT,
  deleteChatMemory,
  forgetAllChatMemories,
  listChatMemories,
  memoryCountLabel,
  memoryMeta,
  type ChatMemory,
  type MemoryCategory,
} from '@fatia/api-client';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
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

/** O ícone e a cor de cada categoria, como na prancha Al-M9. Sem categoria (antigas): livro. */
const CATEGORY_CHIP: Record<MemoryCategory, { icon: LucideIcon; className: string }> = {
  PREFERENCE: { icon: Apple, className: 'bg-primary/15 text-success' },
  ROUTINE: { icon: Clock, className: 'bg-info/15 text-info' },
  TRAINING: { icon: Info, className: 'bg-warning/15 text-warning' },
  HABIT: { icon: Sun, className: 'bg-primary/15 text-success' },
};
const NO_CATEGORY_CHIP = { icon: BookOpen, className: 'bg-foreground/[0.08] text-foreground/70' };

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
    <li className="flex items-center gap-3 px-3 py-3 [&+&]:border-t [&+&]:border-border">
      <CategoryChip category={memoria.category} />
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

function CategoryChip({ category }: { category: MemoryCategory | null }) {
  const { icon: Icone, className } = category ? CATEGORY_CHIP[category] : NO_CATEGORY_CHIP;
  return (
    <span
      aria-hidden
      className={cn('grid size-9 shrink-0 place-items-center rounded-xl', className)}
    >
      <Icone size={16} />
    </span>
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
        className={cn(
          ghostButton,
          'min-h-12 w-full rounded-full border border-border px-4 text-sm font-semibold text-danger',
        )}
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
 * que a equipe não vê e o "Apagar todas" com confirmação. Abre pelo atalho "O que a IA lembra" da
 * Config da IA; não tem botão no topo do chat (#487).
 */
export function MemoriesDrawer({
  open: visivel,
  onOpenChange: setVisivel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
                <ul aria-label="Memórias" className="rounded-2xl bg-foreground/[0.04]">
                  {memorias.map((memoria) => (
                    <Item key={memoria.id} memoria={memoria} />
                  ))}
                </ul>
              )}
              <p className="flex items-center gap-3 rounded-2xl bg-foreground/[0.04] p-3 text-xs text-muted-foreground">
                <ShieldCheck size={16} aria-hidden className="shrink-0 text-foreground/60" />
                {MEMORIES_COPY.teamNote}
              </p>
              {memorias.length > 0 ? <ApagarTodas /> : null}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
