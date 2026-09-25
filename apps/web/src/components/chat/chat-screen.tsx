'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuiState } from '@assistant-ui/react';
import { getChatAvailability } from '@fatia/api-client';
import { EmptyState, EmptyStateGreeting } from '@/components/elements/empty-state';
import { useConversaAberta } from './chat-runtime-provider';
import { GavetaDeConversas } from './conversas';
import { GavetaDeMemorias } from './memorias';
import { ChatThread } from './thread';

/**
 * A tela do chat: cabeçalho com a gaveta de conversas, a conversa e o composer.
 *
 * Instância sem agente mostra que o chat não existe aqui, em vez de uma caixa
 * que sempre falha: uma funcionalidade que sempre erra é pior que uma que não
 * aparece, e o auto-hospedado sem IA continua um produto inteiro.
 */
export function ChatScreen() {
  const aberta = useConversaAberta();
  const titulo = useAuiState((s) => s.threadListItem?.title) ?? 'Chat';
  const { data: disponivel } = useQuery({
    queryKey: ['chat', 'availability'],
    queryFn: getChatAvailability,
    staleTime: 5 * 60_000,
  });

  return (
    <div
      /*
        `10rem` = `pt-16` (4rem) + `pb-24` (6rem), o respiro que o layout de
        `(app)` reserva para a barra do topo e a de baixo. Subtrair só a de baixo
        faz a caixa terminar DENTRO da `bottom-nav`, que é `fixed` com `z-50`: o
        campo fica visível e intocável (#255). `chat-cabe-na-tela.test.ts` amarra
        este número ao do layout.
      */
      className="flex h-[calc(100dvh-10rem)] flex-col"
    >
      <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-extrabold text-foreground">{titulo}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Peça para registrar refeição, consultar treino ou ver sua evolução.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <GavetaDeMemorias />
          <GavetaDeConversas aberta={aberta} />
        </div>
      </header>

      {disponivel?.available === false ? (
        <EmptyState className="my-auto max-w-none self-center">
          <EmptyStateGreeting>O chat com IA não está ligado nesta instância.</EmptyStateGreeting>
        </EmptyState>
      ) : (
        <ChatThread />
      )}
    </div>
  );
}
