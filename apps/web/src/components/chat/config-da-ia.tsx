'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Apple,
  BookOpen,
  ChevronRight,
  Crown,
  Dumbbell,
  Link2,
  Lock,
  Search,
  Settings2,
  Target,
  type LucideIcon,
} from 'lucide-react';
import {
  AI_NEVER_AUTOMATIC,
  AI_SETTINGS_COPY,
  AI_WRITE_CATEGORIES,
  AI_WRITE_MODE_LABELS,
  getAiSettings,
  memoryCountLabel,
  nextAiWriteMode,
  setAiWriteMode,
  type AiSettings,
  type AiWriteCategory,
  type AiWriteMode,
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
import { useChaveDaBusca } from './catalogo';

export const CHAVE_DA_CONFIG_DA_IA = ['chat', 'settings'] as const;

/** O ícone de cada categoria, como na prancha Al-M24. */
const CATEGORY_ICONS: Record<AiWriteCategory, LucideIcon> = {
  DAY_LOG: Apple,
  WORKOUT: Dumbbell,
  GOALS: Target,
  MEMORIES: BookOpen,
};

const COR_DO_MODO: Record<AiWriteMode, string> = {
  ASK: 'bg-foreground/[0.08] text-foreground',
  AUTO: 'bg-primary/15 text-success',
  OFF: 'bg-foreground/[0.04] text-muted-foreground',
};

/**
 * Config da IA (prancha Al-M24, ADR 039): o modo de cada categoria, o que nunca é
 * automático, a busca na web e os atalhos. O chip gira Perguntar antes → Automático →
 * Desligado a cada toque; a API grava e o próximo turno já obedece.
 */
export function ConfigDaIa({ onAbrirMemorias }: { onAbrirMemorias?: () => void }) {
  const [aberta, setAberta] = useState(false);
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: CHAVE_DA_CONFIG_DA_IA,
    queryFn: getAiSettings,
    enabled: aberta,
  });
  const mudarModo = useMutation({
    mutationFn: ({ categoria, modo }: { categoria: AiWriteCategory; modo: AiWriteMode }) =>
      setAiWriteMode(categoria, modo),
    onSuccess: (modes) =>
      queryClient.setQueryData<AiSettings>(CHAVE_DA_CONFIG_DA_IA, (antes) =>
        antes ? { ...antes, modes } : antes,
      ),
  });
  const busca = useChaveDaBusca();
  const textos = AI_SETTINGS_COPY;
  const webLigada = data?.webSearchEnabled ?? false;

  return (
    <Drawer open={aberta} onOpenChange={setAberta}>
      <DrawerTrigger
        aria-label={textos.title}
        className={cn(ghostButton, 'rounded-full p-2 text-foreground/70')}
      >
        <Settings2 size={20} aria-hidden />
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle>{textos.title}</DrawerTitle>
          <DrawerDescription>{textos.modesTitle}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-8">
          {isLoading ? (
            <p className="py-4 text-sm text-muted-foreground">Carregando…</p>
          ) : isError || !data ? (
            <p className="py-4 text-sm text-muted-foreground">Não deu para carregar agora.</p>
          ) : (
            <>
              <section className="flex flex-col gap-2">
                <ul className="flex flex-col rounded-2xl bg-foreground/[0.04] px-2">
                  {AI_WRITE_CATEGORIES.map((c, i) => {
                    const modo = data.modes[c.key];
                    const Icone = CATEGORY_ICONS[c.key];
                    return (
                      <li key={c.key} className={cn(i > 0 && 'border-t border-border')}>
                        <button
                          type="button"
                          disabled={mudarModo.isPending}
                          onClick={() =>
                            mudarModo.mutate({ categoria: c.key, modo: nextAiWriteMode(modo) })
                          }
                          className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-foreground/[0.04]"
                        >
                          <Icone size={16} aria-hidden className="shrink-0 text-foreground/60" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-foreground">
                              {c.title}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {c.description}
                            </span>
                          </span>
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                              COR_DO_MODO[modo],
                            )}
                          >
                            {AI_WRITE_MODE_LABELS[modo]}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {mudarModo.isError ? (
                  <p role="alert" className="text-xs text-danger">
                    Não consegui mudar agora. Tente de novo.
                  </p>
                ) : null}
                <p className="text-xs leading-relaxed text-muted-foreground">{textos.modesNote}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{textos.offNote}</p>
              </section>

              <section className="flex flex-col gap-2 rounded-2xl bg-foreground/[0.04] p-4">
                <h3 className="text-sm font-semibold text-foreground">{textos.neverTitle}</h3>
                <ul aria-label={textos.neverTitle} className="flex flex-col gap-1">
                  {AI_NEVER_AUTOMATIC.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-foreground/80">
                      <Lock size={14} aria-hidden className="shrink-0 text-foreground/60" />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">{textos.neverNote}</p>
              </section>

              <section className="flex flex-col gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={webLigada}
                  aria-label={`${textos.webTitle}: ${webLigada ? textos.webOn : textos.webOff}`}
                  disabled={busca.isPending}
                  onClick={() =>
                    busca.mutate(!webLigada, {
                      onSuccess: () =>
                        queryClient.setQueryData<AiSettings>(CHAVE_DA_CONFIG_DA_IA, (antes) =>
                          antes ? { ...antes, webSearchEnabled: !webLigada } : antes,
                        ),
                    })
                  }
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-foreground/[0.04] px-4 py-2 text-left hover:bg-foreground/[0.06]"
                >
                  <Search size={16} aria-hidden className="shrink-0 text-foreground/60" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">
                      {textos.webTitle}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {textos.webDescription}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                      webLigada ? COR_DO_MODO.AUTO : COR_DO_MODO.OFF,
                    )}
                  >
                    {webLigada ? textos.webOn : textos.webOff}
                  </span>
                </button>
                <p className="text-xs leading-relaxed text-muted-foreground">{textos.webNote}</p>
              </section>

              <section className="flex flex-col">
                <h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {textos.moreTitle}
                </h3>
                <div className="flex flex-col rounded-2xl bg-foreground/[0.04] px-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAberta(false);
                      onAbrirMemorias?.();
                    }}
                    className="flex min-h-12 items-center gap-3 px-2 text-left text-sm text-foreground hover:bg-foreground/[0.04]"
                  >
                    <BookOpen size={16} aria-hidden className="shrink-0 text-foreground/60" />
                    <span className="flex-1">{textos.memories}</span>
                    <span className="text-xs text-muted-foreground">
                      {memoryCountLabel(data.memories.count, data.memories.limit)}
                    </span>
                    <ChevronRight size={16} aria-hidden className="text-foreground/40" />
                  </button>
                  <Link
                    href="/profile/connect"
                    className="flex min-h-12 items-center gap-3 border-t border-border px-2 text-sm text-foreground hover:bg-foreground/[0.04]"
                  >
                    <Link2 size={16} aria-hidden className="shrink-0 text-foreground/60" />
                    <span className="flex-1">{textos.ownAi}</span>
                    <ChevronRight size={16} aria-hidden className="text-foreground/40" />
                  </Link>
                  <Link
                    href="/plan"
                    className="flex min-h-12 items-center gap-3 border-t border-border px-2 text-sm text-foreground hover:bg-foreground/[0.04]"
                  >
                    <Crown size={16} aria-hidden className="shrink-0 text-foreground/60" />
                    <span className="flex-1">{textos.plan}</span>
                    <ChevronRight size={16} aria-hidden className="text-foreground/40" />
                  </Link>
                </div>
              </section>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
