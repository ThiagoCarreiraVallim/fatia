'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  getChatAvailability,
  getConversation,
  listChatAgents,
  listChatToolTitles,
  type ChatAgentHeader,
  type ChatAvailability,
} from '@fatia/api-client';
import { useChatRuntime, useChatThreadList, type ChatRuntimeExtras } from './use-chat-runtime';
import { RespostaEmSegundoPlano } from './resposta-em-segundo-plano';

/**
 * O runtime do chat, acima da conversa **e** da lista de conversas.
 *
 * Mora no layout do app inteiro, e não só no de `/chat` (ADR 035): a resposta
 * continua chegando enquanto a pessoa vai ao diário ou ao treino, e quem está
 * fora do chat vê um aviso discreto e, no fim, "Resposta pronta". A lista (a
 * gaveta de conversas) e a conversa aberta continuam com a mesma fonte.
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

/** Os agentes de comunidade que a pessoa pode escolher, e o padrão (Fase 7c). */
export function useAgentesDoChat() {
  return useQuery({
    queryKey: ['chat', 'agents'],
    queryFn: listChatAgents,
    staleTime: 5 * 60_000,
  });
}

/**
 * Título e agente da conversa, do servidor. `null` quando a conversa ainda não
 * existe lá — a nova, antes de a primeira mensagem criá-la. A chave fica sob a
 * das conversas, que o fim de cada turno e o renomear já invalidam.
 */
export function useCabecalhoDaConversa(aberta: string | undefined) {
  return useQuery({
    queryKey: [...CHAVE_DAS_CONVERSAS, 'cabecalho', aberta],
    queryFn: async () => {
      try {
        const c = await getConversation(aberta as string);
        return { title: c.title, agent: c.agent ?? null };
      } catch (erro) {
        if (erro instanceof ApiError && erro.isNotFound) return null;
        throw erro;
      }
    },
    enabled: Boolean(aberta),
  });
}

/**
 * A escolha do agente numa conversa nova: `undefined` é o padrão (a comunidade
 * do assento), `null` é o assistente da Fatia. Só vale para a conversa que ainda
 * não existe — a API grava o agente quando ela nasce e ignora o resto.
 */
const EscolhaDoAgenteContext = createContext<{
  escolhido: string | null | undefined;
  escolher: (groupId: string | null) => void;
}>({ escolhido: undefined, escolher: () => undefined });

export const useEscolhaDoAgente = () => useContext(EscolhaDoAgenteContext);

/**
 * Quem responde nesta conversa: o agente da comunidade, `null` para o
 * assistente da Fatia, ou `undefined` enquanto não se sabe (a conversa está
 * carregando). Na conversa nova é o escolhido; depois, o que o servidor gravou.
 */
export function useAgenteDaConversa(): ChatAgentHeader | null | undefined {
  const aberta = useConversaAberta();
  const cabecalho = useCabecalhoDaConversa(aberta);
  const agentes = useAgentesDoChat().data;
  const { escolhido } = useEscolhaDoAgente();
  if (aberta && cabecalho.isPending) return undefined;
  if (cabecalho.data) return cabecalho.data.agent;
  const id = escolhido === undefined ? (agentes?.defaultGroupId ?? null) : escolhido;
  return agentes?.agents.find((a) => a.groupId === id) ?? null;
}

type Voto = ReturnType<typeof useChatRuntime>['voto'];

const ExtrasContext = createContext<ChatRuntimeExtras>({
  titulos: {},
  artefatos: {},
  plano: null,
  timings: {},
  stopped: new Set(),
  turnError: null,
});
const MarkStoppedContext = createContext<(messageId: string) => void>(() => undefined);
type LiveJoinState = ReturnType<typeof useChatRuntime>['liveJoin'];
const LiveJoinContext = createContext<LiveJoinState>({
  pending: false,
  consume: () => undefined,
  missed: () => false,
});
const VotoContext = createContext<Voto | null>(null);
const ConversaContext = createContext<string | undefined>(undefined);

export const useTitulosDasTools = () => useContext(ExtrasContext).titulos;
export const useArtefato = (toolCallId: string) => useContext(ExtrasContext).artefatos[toolCallId];
export const useArtefatos = () => useContext(ExtrasContext).artefatos;
export const usePlanoDoTurno = () => useContext(ExtrasContext).plano;
export const useVoto = () => useContext(VotoContext);
export const useConversaAberta = () => useContext(ConversaContext);
export const useTurnTiming = (messageId: string) => useContext(ExtrasContext).timings[messageId];
export const useIsStopped = (messageId: string) => useContext(ExtrasContext).stopped.has(messageId);
export const useTurnError = () => useContext(ExtrasContext).turnError;
export const useMarkStopped = () => useContext(MarkStoppedContext);
export const useLiveJoin = () => useContext(LiveJoinContext);

export function ChatRuntimeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const lista = useChatThreadList();
  // Fora do `/chat` o runtime continua na última conversa aberta: trocar para
  // "nenhuma" faria o assistant-ui abandonar a resposta que ainda está chegando
  // (ADR 035). Só dentro do chat a rota manda.
  const daRota = conversaDaRota(pathname);
  const noChat = pathname === PREFIXO || Boolean(pathname?.startsWith(`${PREFIXO}/`));
  const [ultimaAberta, setUltimaAberta] = useState(daRota);
  if (noChat && daRota !== ultimaAberta) setUltimaAberta(daRota);
  const alvo = noChat ? daRota : ultimaAberta;
  const disponivel = useDisponibilidadeDoChat();
  const [escolhido, setEscolhido] = useState<string | null | undefined>(undefined);
  // Conversa nova (sem id na rota) começa do padrão de novo. Passar da `/chat`
  // para o id recém-criado não zera: a escolha é dessa conversa. Ajustado no
  // render, e não num efeito, para a tela nova não piscar a escolha anterior.
  const [alvoVisto, setAlvoVisto] = useState(alvo);
  if (alvo !== alvoVisto) {
    setAlvoVisto(alvo);
    if (!alvo) setEscolhido(undefined);
  }
  // Em ref para o `stream`, que lê no envio: é o que vai no corpo do turno.
  const agenteEscolhido = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    agenteEscolhido.current = escolhido;
  }, [escolhido]);
  const escolher = useCallback((groupId: string | null) => setEscolhido(groupId), []);
  const escolha = useMemo(() => ({ escolhido, escolher }), [escolhido, escolher]);

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
  const {
    runtime,
    liveJoin,
    titulos,
    artefatos,
    plano,
    timings,
    stopped,
    turnError,
    markStopped,
    voto,
  } = useChatRuntime({
    conversationId: lista.ready ? alvo : undefined,
    threadListAdapter: lista.adapter,
    onThreadIdChange: aoTrocarDeConversa,
    fotos: disponivel?.photos ?? false,
    agenteEscolhido,
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
    // Fora do chat ninguém mostra tool; o diário não precisa pagar esta ida.
    enabled: noChat,
  });
  const todosOsTitulos = useMemo(
    () => ({ ...titulosDoServidor, ...titulos }),
    [titulosDoServidor, titulos],
  );
  const extras = useMemo(
    () => ({ titulos: todosOsTitulos, artefatos, plano, timings, stopped, turnError }),
    [todosOsTitulos, artefatos, plano, timings, stopped, turnError],
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ConversaContext.Provider value={alvo}>
        <EscolhaDoAgenteContext.Provider value={escolha}>
          <ExtrasContext.Provider value={extras}>
            <MarkStoppedContext.Provider value={markStopped}>
              <LiveJoinContext.Provider value={liveJoin}>
                <VotoContext.Provider value={voto}>
                  {children}
                  {noChat ? null : <RespostaEmSegundoPlano conversa={alvo} />}
                </VotoContext.Provider>
              </LiveJoinContext.Provider>
            </MarkStoppedContext.Provider>
          </ExtrasContext.Provider>
        </EscolhaDoAgenteContext.Provider>
      </ConversaContext.Provider>
    </AssistantRuntimeProvider>
  );
}
