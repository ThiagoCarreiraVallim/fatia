'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getChatAvailability, listChatToolTitles, type ChatAvailability } from '@fatia/api-client';
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
export const CHAVE_DAS_MEMORIAS = ['chat', 'memories'] as const;
export const CHAVE_DA_COTA = ['chat', 'quota'] as const;
export const CHAVE_DA_DISPONIBILIDADE = ['chat', 'availability'] as const;

/** Se o chat existe aqui e o que ele sabe além de texto. Uma consulta para as telas todas. */
export function useDisponibilidadeDoChat(): ChatAvailability | undefined {
  return useQuery({
    queryKey: CHAVE_DA_DISPONIBILIDADE,
    queryFn: getChatAvailability,
    staleTime: 5 * 60_000,
  }).data;
}

type Voto = ReturnType<typeof useChatRuntime>['voto'];

const ExtrasContext = createContext<ChatRuntimeExtras>({ titulos: {}, artefatos: {}, plano: null });
const VotoContext = createContext<Voto | null>(null);
const ConversaContext = createContext<string | undefined>(undefined);

export const useTitulosDasTools = () => useContext(ExtrasContext).titulos;
export const useArtefato = (toolCallId: string) => useContext(ExtrasContext).artefatos[toolCallId];
export const usePlanoDoTurno = () => useContext(ExtrasContext).plano;
export const useVoto = () => useContext(VotoContext);
export const useConversaAberta = () => useContext(ConversaContext);

export function ChatRuntimeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const lista = useChatThreadList();
  const alvo = conversaDaRota(pathname);
  const disponivel = useDisponibilidadeDoChat();

  const aoTrocarDeConversa = useCallback(
    (threadId: string | undefined) => {
      // Só id de conversa vira rota: o id local que o runtime usa antes de a
      // conversa ter endereço levaria a uma URL que não abre nada.
      const destino = threadId ? conversaDaRota(`${PREFIXO}/${threadId}`) : undefined;
      if (!destino || conversaDaRota(pathname) === destino) return;
      router.push(`${PREFIXO}/${destino}`);
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
  const { runtime, titulos, artefatos, plano, voto } = useChatRuntime({
    conversationId: lista.ready ? alvo : undefined,
    threadListAdapter: lista.adapter,
    onThreadIdChange: aoTrocarDeConversa,
    fotos: disponivel?.photos ?? false,
    // O turno pode ter guardado uma memória e gastou cota: as três listas mudam juntas.
    onTurnEnd: () => {
      for (const queryKey of [CHAVE_DAS_CONVERSAS, CHAVE_DAS_MEMORIAS, CHAVE_DA_COTA]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
  // O `catalog` só chega no turno ao vivo; depois de um F5 as tools do histórico
  // seriam rotuladas pelo nome técnico. A lista do servidor cobre as duas.
  const { data: titulosDoServidor } = useQuery({
    queryKey: ['chat', 'tools'],
    queryFn: listChatToolTitles,
    staleTime: 60 * 60_000,
  });
  const todosOsTitulos = useMemo(
    () => ({ ...titulosDoServidor, ...titulos }),
    [titulosDoServidor, titulos],
  );
  const extras = useMemo(
    () => ({ titulos: todosOsTitulos, artefatos, plano }),
    [todosOsTitulos, artefatos, plano],
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ConversaContext.Provider value={alvo}>
        <ExtrasContext.Provider value={extras}>
          <VotoContext.Provider value={voto}>{children}</VotoContext.Provider>
        </ExtrasContext.Provider>
      </ConversaContext.Provider>
    </AssistantRuntimeProvider>
  );
}
