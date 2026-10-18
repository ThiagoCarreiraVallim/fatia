'use client';

import { useAuiState } from '@assistant-ui/react';
import { EmptyState, EmptyStateGreeting } from '@/components/elements/empty-state';
import { TopBarActions, useTopBarTitle } from '@/components/layout/app-top-bar';
import {
  useCabecalhoDaConversa,
  useConversaAberta,
  useDisponibilidadeDoChat,
} from './chat-runtime-provider';
import { LinhaDoAgente } from './agente';
import { GavetaDeConversas } from './conversas';
import { GavetaDeMemorias } from './memorias';
import { UpsellIA } from './upsell-ia';
import { ChatThread } from './thread';

/**
 * A tela do chat: o nome da conversa e as gavetas (memórias, conversas) vão
 * para a barra de topo; aqui ficam a conversa e o composer.
 *
 * Instância sem agente mostra que o chat não existe aqui, em vez de uma caixa
 * que sempre falha: uma funcionalidade que sempre erra é pior que uma que não
 * aparece, e o auto-hospedado sem IA continua um produto inteiro.
 */
export function ChatScreen() {
  const aberta = useConversaAberta();
  // Do servidor, e não só da lista do runtime: o nome é gerado depois do primeiro
  // turno, e a lista do runtime não é relida.
  const doServidor = useCabecalhoDaConversa(aberta).data?.title;
  const doRuntime = useAuiState((s) => s.threadListItem?.title);
  const titulo = doServidor ?? doRuntime ?? 'Chat';
  const disponivel = useDisponibilidadeDoChat();
  useTopBarTitle(titulo);

  return (
    <div
      /*
        `10.5rem` = a barra de topo (`h-14`, 3.5rem) + `pt-4` (1rem) + `pb-24`
        (6rem), o respiro que o `<main>` de `(app)` reserva; mais as áreas
        seguras que o wrapper do layout soma.
        Subtrair menos faz a caixa terminar DENTRO da `bottom-nav`, que é
        `fixed` com `z-50`: o campo fica visível e intocável (#255).
        `chat-cabe-na-tela.test.ts` amarra esta conta à do layout.
      */
      className="flex h-[calc(100dvh-10.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col"
    >
      <TopBarActions>
        <GavetaDeMemorias />
        <GavetaDeConversas aberta={aberta} />
      </TopBarActions>
      <LinhaDoAgente />

      {disponivel?.available === false ? (
        <EmptyState className="my-auto max-w-none self-center">
          <EmptyStateGreeting>O chat com IA não está ligado nesta instância.</EmptyStateGreeting>
        </EmptyState>
      ) : disponivel?.reason === 'plan_required' ? (
        <UpsellIA />
      ) : (
        <ChatThread />
      )}
    </div>
  );
}
