'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useChatRuntime, useChatThreadList, type ChatRuntimeExtras } from './use-chat-runtime';

/**
 * O runtime do chat, acima da conversa **e** da lista de conversas.
 *
 * Mora no layout de `/chat`, e não na tela da conversa, porque a lista (a gaveta
 * de conversas) e a conversa aberta precisam da mesma fonte: com um runtime por
 * tela, cada uma buscaria a lista por conta própria e divergiriam.
 */

const PREFIXO = '/chat';

/** O id da conversa aberta, quando a rota é a de uma conversa. */
export function conversaDaRota(pathname: string | null): string | undefined {
  if (!pathname?.startsWith(`${PREFIXO}/`)) return undefined;
  const trecho = pathname.slice(PREFIXO.length + 1).split('/')[0];
  return /^[0-9a-f-]{36}$/i.test(trecho) ? trecho : undefined;
}

export const CHAVE_DAS_CONVERSAS = ['chat', 'conversations'] as const;

type Voto = ReturnType<typeof useChatRuntime>['voto'];

const ExtrasContext = createContext<ChatRuntimeExtras>({ titulos: {} });
const VotoContext = createContext<Voto | null>(null);
const ConversaContext = createContext<string | undefined>(undefined);

export const useTitulosDasTools = () => useContext(ExtrasContext).titulos;
export const useVoto = () => useContext(VotoContext);
export const useConversaAberta = () => useContext(ConversaContext);

export function ChatRuntimeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const lista = useChatThreadList();
  const alvo = conversaDaRota(pathname);

  const aoTrocarDeConversa = useCallback(
    (threadId: string | undefined) => {
      if (!threadId || conversaDaRota(pathname) === threadId) return;
      router.push(`${PREFIXO}/${threadId}`);
    },
    [pathname, router],
  );

  /**
   * 🔴 A conversa da URL só é entregue ao runtime **depois** que a lista responde.
   *
   * O `switchToThread` do assistant-ui desiste quando a conversa de destino já é
   * a principal. Num link direto — que é como um F5 se comporta — a conversa da
   * URL já nasceria sendo a principal, a troca retornaria cedo e o `load` nunca
   * rodaria: a tela abriria vazia, com a conversa inteira no servidor. Entregando
   * o id depois, a troca passa a ser de uma conversa para outra, que é o caminho
   * que funciona. (Observado e corrigido na Lunia, que usa o mesmo runtime.)
   */
  const { runtime, titulos, voto } = useChatRuntime({
    conversationId: lista.ready ? alvo : undefined,
    threadListAdapter: lista.adapter,
    onThreadIdChange: aoTrocarDeConversa,
    onTurnEnd: () => void queryClient.invalidateQueries({ queryKey: CHAVE_DAS_CONVERSAS }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ConversaContext.Provider value={alvo}>
        <ExtrasContext.Provider value={{ titulos }}>
          <VotoContext.Provider value={voto}>{children}</VotoContext.Provider>
        </ExtrasContext.Provider>
      </ConversaContext.Provider>
    </AssistantRuntimeProvider>
  );
}
