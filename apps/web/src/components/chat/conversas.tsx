'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MessagesSquare, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import {
  deleteConversation,
  listConversations,
  renameConversation,
  type ChatConversationSummary,
} from '@fatia/api-client';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ghostButton, inkButton } from '@/components/elements/surfaces';
import { CHAVE_DAS_CONVERSAS } from './chat-runtime-provider';

/**
 * As conversas, numa gaveta: buscar, abrir, renomear, apagar e começar outra.
 *
 * Gaveta, e não barra lateral: o PWA é de celular, com a barra de navegação fixa
 * embaixo, e uma coluna permanente comeria a conversa. Apagar pede um segundo
 * toque no mesmo lugar em vez de um `confirm()` — o diálogo nativo quebra o
 * visual e não é alcançável do mesmo jeito pelo leitor de tela.
 */

export function novaConversa(): string {
  return `/chat/${crypto.randomUUID()}`;
}

function grupoDe(conversa: ChatConversationSummary, agora: Date): 'Hoje' | 'Ontem' | 'Anteriores' {
  const dia = new Date(conversa.updatedAt);
  const inicioDeHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const inicioDeOntem = new Date(inicioDeHoje.getTime() - 86_400_000);
  if (dia >= inicioDeHoje) return 'Hoje';
  if (dia >= inicioDeOntem) return 'Ontem';
  return 'Anteriores';
}

export function agrupar(
  conversas: readonly ChatConversationSummary[],
  agora = new Date(),
): { grupo: string; itens: ChatConversationSummary[] }[] {
  const ordem = ['Hoje', 'Ontem', 'Anteriores'] as const;
  return ordem
    .map((grupo) => ({ grupo, itens: conversas.filter((c) => grupoDe(c, agora) === grupo) }))
    .filter((g) => g.itens.length > 0);
}

function Item({
  conversa,
  aberta,
  onAbrir,
}: {
  conversa: ChatConversationSummary;
  aberta: boolean;
  onAbrir: () => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(conversa.title ?? '');
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const atualizar = () => queryClient.invalidateQueries({ queryKey: CHAVE_DAS_CONVERSAS });

  const renomear = useMutation({
    mutationFn: (novo: string) => renameConversation(conversa.id, novo),
    onSuccess: () => {
      setEditando(false);
      void atualizar();
    },
  });
  const apagar = useMutation({
    mutationFn: () => deleteConversation(conversa.id),
    onSuccess: () => {
      void atualizar();
      if (aberta) router.push(novaConversa());
    },
  });

  if (editando) {
    return (
      <form
        className="flex items-center gap-1 px-2 py-1"
        onSubmit={(evento) => {
          evento.preventDefault();
          if (titulo.trim()) renomear.mutate(titulo.trim());
        }}
      >
        <Input
          autoFocus
          aria-label="Novo nome da conversa"
          value={titulo}
          maxLength={80}
          onChange={(evento) => setTitulo(evento.target.value)}
          className="h-8 text-sm"
        />
        <button type="submit" aria-label="Salvar nome" className={cn(ghostButton, 'rounded p-1.5')}>
          <Check size={15} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Cancelar"
          onClick={() => setEditando(false)}
          className={cn(ghostButton, 'rounded p-1.5')}
        >
          <X size={15} aria-hidden />
        </button>
      </form>
    );
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-lg px-2',
        aberta && 'bg-foreground/[0.06]',
      )}
    >
      <button
        type="button"
        onClick={onAbrir}
        aria-current={aberta ? 'page' : undefined}
        className="min-w-0 flex-1 truncate py-2.5 text-left text-sm text-foreground"
      >
        {conversa.title ?? 'Nova conversa'}
      </button>
      <button
        type="button"
        aria-label={`Renomear ${conversa.title ?? 'conversa'}`}
        onClick={() => setEditando(true)}
        className={cn(ghostButton, 'rounded p-1.5 text-foreground/50')}
      >
        <Pencil size={14} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={
          confirmandoExclusao ? 'Confirmar exclusão' : `Apagar ${conversa.title ?? 'conversa'}`
        }
        onClick={() => (confirmandoExclusao ? apagar.mutate() : setConfirmandoExclusao(true))}
        onBlur={() => setConfirmandoExclusao(false)}
        className={cn(
          ghostButton,
          'rounded p-1.5',
          confirmandoExclusao ? 'text-rose-500' : 'text-foreground/50',
        )}
      >
        {confirmandoExclusao ? (
          <span className="text-xs font-semibold">Apagar?</span>
        ) : (
          <Trash2 size={14} aria-hidden />
        )}
      </button>
    </div>
  );
}

export function GavetaDeConversas({ aberta }: { aberta: string | undefined }) {
  const router = useRouter();
  const [visivel, setVisivel] = useState(false);
  const [busca, setBusca] = useState('');
  const termo = busca.trim();
  const { data: conversas = [], isLoading } = useQuery({
    queryKey: [...CHAVE_DAS_CONVERSAS, termo],
    queryFn: () => listConversations(termo || undefined),
    enabled: visivel,
  });

  const abrir = (caminho: string) => {
    setVisivel(false);
    router.push(caminho);
  };

  return (
    <Drawer open={visivel} onOpenChange={setVisivel}>
      <DrawerTrigger
        aria-label="Conversas"
        className={cn(ghostButton, 'rounded-full p-2 text-foreground/70')}
      >
        <MessagesSquare size={20} aria-hidden />
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="flex items-center justify-between gap-2">
          <div>
            <DrawerTitle>Conversas</DrawerTitle>
            <DrawerDescription className="sr-only">
              Abrir, renomear ou apagar uma conversa com o assistente.
            </DrawerDescription>
          </div>
          <button
            type="button"
            onClick={() => abrir(novaConversa())}
            className={cn(
              inkButton,
              'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold',
            )}
          >
            <Plus size={14} aria-hidden />
            Nova conversa
          </button>
        </DrawerHeader>
        <div className="relative px-4 pb-2">
          <Search
            size={14}
            className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 text-foreground/40"
            aria-hidden
          />
          <Input
            aria-label="Buscar conversa"
            placeholder="Buscar pelo nome"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <nav aria-label="Lista de conversas" className="overflow-y-auto px-2 pb-6">
          {isLoading ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">Carregando…</p>
          ) : conversas.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              {termo ? 'Nenhuma conversa com esse nome.' : 'Nenhuma conversa ainda.'}
            </p>
          ) : (
            agrupar(conversas).map(({ grupo, itens }) => (
              <section key={grupo} className="mb-2">
                <h3 className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-foreground/40">
                  {grupo}
                </h3>
                {itens.map((conversa) => (
                  <Item
                    key={conversa.id}
                    conversa={conversa}
                    aberta={conversa.id === aberta}
                    onAbrir={() => abrir(`/chat/${conversa.id}`)}
                  />
                ))}
              </section>
            ))
          )}
        </nav>
      </DrawerContent>
    </Drawer>
  );
}
