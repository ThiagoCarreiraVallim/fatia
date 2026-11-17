'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuiState } from '@assistant-ui/react';
import { SquarePen } from 'lucide-react';
import { EmptyState, EmptyStateGreeting } from '@/components/elements/empty-state';
import { ghostButton } from '@/components/elements/surfaces';
import { TopBarActions, useTopBarTitle } from '@/components/layout/app-top-bar';
import { WebSearchSwitch } from './aceite';
import {
  useCabecalhoDaConversa,
  useConversaAberta,
  useDisponibilidadeDoChat,
} from './chat-runtime-provider';
import { LinhaDoAgente } from './agente';
import { GavetaDeConversas, novaConversa } from './conversas';
import { GavetaDeMemorias } from './memorias';
import { ConfigDaIa } from './config-da-ia';
import { UpsellIA } from './upsell-ia';
import { ChatThread } from './thread';
import { cn } from '@/lib/utils';

/**
 * A tela do chat: o nome da conversa e as gavetas (memórias, conversas) vão
 * para a barra de topo; aqui ficam a conversa e o composer.
 *
 * Instância sem agente mostra que o chat não existe aqui, em vez de uma caixa
 * que sempre falha: uma funcionalidade que sempre erra é pior que uma que não
 * aparece, e o auto-hospedado sem IA continua um produto inteiro.
 */
export function ChatScreen() {
  const router = useRouter();
  const openId = useConversaAberta();
  // Do servidor, e não só da lista do runtime: o nome é gerado depois do primeiro
  // turno, e a lista do runtime não é relida.
  const fromServer = useCabecalhoDaConversa(openId).data?.title;
  const fromRuntime = useAuiState((s) => s.threadListItem?.title);
  const title = fromServer ?? fromRuntime ?? 'Chat';
  const availability = useDisponibilidadeDoChat();
  const [memoriasAbertas, setMemoriasAbertas] = useState(false);
  useTopBarTitle(title);

  return (
    <div
      /*
        `6.5rem` = a barra de topo (`h-14`, 3.5rem) + `pt-4` (1rem) + `pb-8`
        (2rem) do `<main>` de `(app)`; mais as áreas seguras que o wrapper do
        layout soma. A barra de baixo some no chat (tarefa de foco), e o
        respiro dela (`BottomSpacer`) também.
        Subtrair menos faz a caixa passar da tela, e com a barra visível o
        campo ficaria DENTRO dela: visível e intocável (#255).
        `chat-cabe-na-tela.test.ts` amarra esta conta à do layout.
      */
      className="flex h-[calc(100dvh-6.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col"
    >
      <TopBarActions>
        <WebSearchSwitch />
        <GavetaDeMemorias aberta={memoriasAbertas} onAberta={setMemoriasAbertas} />
        <ConfigDaIa onAbrirMemorias={() => setMemoriasAbertas(true)} />
        <GavetaDeConversas aberta={openId} />
        {/* Como no app: começar outra conversa a um toque, sem abrir a gaveta. */}
        <button
          type="button"
          aria-label="Nova conversa"
          onClick={() => router.push(novaConversa())}
          className={cn(ghostButton, 'rounded-full p-2 text-foreground/70')}
        >
          <SquarePen size={20} aria-hidden />
        </button>
      </TopBarActions>
      <LinhaDoAgente />

      {availability?.available === false ? (
        <EmptyState className="my-auto max-w-none self-center">
          <EmptyStateGreeting>O chat com IA não está ligado nesta instância.</EmptyStateGreeting>
        </EmptyState>
      ) : availability?.reason === 'plan_required' ? (
        <UpsellIA />
      ) : (
        <ChatThread />
      )}
    </div>
  );
}
