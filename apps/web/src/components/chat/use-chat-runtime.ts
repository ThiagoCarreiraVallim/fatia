'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAssistantStream } from 'assistant-stream';
import type { FeedbackAdapter, RemoteThreadListAdapter } from '@assistant-ui/react';
import { useLangGraphRuntime, type LangChainMessage } from '@assistant-ui/react-langgraph';
import {
  ApiError,
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
  sendChatFeedback,
  streamChat,
  type ChatArtifact,
  type ChatPlanStep,
  type ChatReviewReason,
} from '@fatia/api-client';
import {
  decodificarRetomada,
  historicoParaMensagens,
  pausaPendente,
  textoDaMensagem,
} from './historico';
import { adaptadorDeFoto, fotosDaMensagem } from './foto';

/** O que vai quando a pessoa manda só a foto: o agente recusa mensagem vazia. */
export const PERGUNTA_DA_FOTO = 'O que tem nesta foto?';

/**
 * Liga o chat do Fatia ao assistant-ui.
 *
 * `useLangGraphRuntime` é o encaixe certo porque o agente fala o vocabulário
 * nativo do LangGraph (ADR 023): o `stream` é um callback nosso, sobre o nosso
 * transporte, e **não** exige um servidor LangGraph Platform. O que a biblioteca
 * traz de graça é a acumulação das mensagens, as partes de tool, o cancelamento
 * e as pausas.
 */

const asData = (valor: string | null | undefined): Date | undefined => {
  if (!valor) return undefined;
  const lida = new Date(valor);
  return Number.isNaN(lida.getTime()) ? undefined : lida;
};

/**
 * A lista de conversas, no formato que o thread list do assistant-ui consome.
 *
 * `ready` vira `true` quando a lista **respondeu** — inclusive com falha: o que
 * importa é que deixou de estar pendente. É o que destrava a conversa da URL, ver
 * `ChatRuntimeProvider`.
 */
export function useChatThreadList(): { adapter: RemoteThreadListAdapter; ready: boolean } {
  const [ready, setReady] = useState(false);

  const adapter = useMemo<RemoteThreadListAdapter>(
    () => ({
      async list() {
        try {
          const conversas = await listConversations();
          return {
            threads: conversas.map((conversa) => ({
              status: 'regular' as const,
              remoteId: conversa.id,
              externalId: conversa.id,
              title: conversa.title ?? undefined,
              lastMessageAt: asData(conversa.updatedAt),
            })),
          };
        } finally {
          setReady(true);
        }
      },
      async rename(remoteId, title) {
        await renameConversation(remoteId, title);
      },
      async delete(remoteId) {
        await deleteConversation(remoteId);
      },
      // A conversa nasce no servidor com a primeira mensagem, com o id que o
      // PWA gerou. Criar aqui deixaria conversa vazia no banco a cada aba aberta.
      async initialize(threadId) {
        return { remoteId: threadId, externalId: threadId };
      },
      // Conversa que ainda não existe no servidor é a nova, com o id que acabou de
      // ser gerado: recusar aqui faz a troca de conversa falhar, e o runtime fica
      // numa conversa local que o primeiro envio transforma em `__LOCALID_…`.
      async fetch(threadId) {
        let conversa;
        try {
          conversa = await getConversation(threadId);
        } catch (erro) {
          if (erro instanceof ApiError && erro.isNotFound) {
            return { status: 'regular' as const, remoteId: threadId, externalId: threadId };
          }
          throw erro;
        }
        return {
          status: 'regular' as const,
          remoteId: threadId,
          externalId: threadId,
          title: conversa.title ?? undefined,
          lastMessageAt: asData(conversa.updatedAt),
        };
      },
      // Quem nomeia é o servidor, depois do primeiro turno (`/title` no agente):
      // o nome é o mesmo em toda aba e em todo aparelho.
      async generateTitle() {
        return createAssistantStream(() => {});
      },
      // Não existe arquivo no banco. Recusar alto é melhor que fingir sucesso e a
      // conversa reaparecer no próximo carregamento.
      async archive() {
        throw new Error('Arquivar conversa não existe no Fatia.');
      },
      async unarchive() {
        throw new Error('Arquivar conversa não existe no Fatia.');
      },
    }),
    [],
  );

  return { adapter, ready };
}

export type ChatRuntimeExtras = {
  /** Nome de tool → título em português, como o agente anunciou no `catalog`. */
  titulos: Readonly<Record<string, string>>;
  /** `toolCallId` → a carga tipada da tool (`artifact`). Só do que passou ao vivo. */
  artefatos: Readonly<Record<string, ChatArtifact>>;
  /** O plano do turno em curso ou do último, quando o agente fez um (`plan`). */
  plano: readonly ChatPlanStep[] | null;
};

export function useChatRuntime({
  conversationId,
  threadListAdapter,
  onThreadIdChange,
  onTurnEnd,
  fotos = false,
}: {
  conversationId: string | undefined;
  /** A instância tem modelo de visão: o composer aceita foto. */
  fotos?: boolean;
  threadListAdapter: RemoteThreadListAdapter;
  onThreadIdChange: (threadId: string | undefined) => void;
  /** Ao fim de cada turno — é quando o título gerado no servidor passa a existir. */
  onTurnEnd?: () => void;
}) {
  const [titulos, setTitulos] = useState<Record<string, string>>({});
  const [artefatos, setArtefatos] = useState<Record<string, ChatArtifact>>({});
  // Com a conversa de origem: trocar de conversa não pode deixar o plano de outra na tela.
  const [plano, setPlano] = useState<{ conversa: string; passos: ChatPlanStep[] } | null>(null);
  // A resposta recém-chegada tem o id do LangChain; o voto vai para a linha do
  // banco. O evento `persisted` liga os dois.
  const linhas = useRef(new Map<string, string>());
  // Em ref, e lidos só no `stream` e no voto: o runtime relê o `stream` a cada
  // envio, e uma troca de conversa no meio de uma geração não pode mudar o
  // destino do que já está no ar.
  const conversaAtual = useRef(conversationId);
  const aoFimDoTurno = useRef(onTurnEnd);
  useEffect(() => {
    conversaAtual.current = conversationId;
    aoFimDoTurno.current = onTurnEnd;
  }, [conversationId, onTurnEnd]);

  const stream = useCallback(async function* (
    messages: LangChainMessage[],
    config: { command?: { resume: string }; abortSignal: AbortSignal },
  ) {
    const conversa = conversaAtual.current;
    if (!conversa) return;
    const ultima = messages.at(-1);
    const anexadas = fotosDaMensagem(ultima);
    const corpo = config.command?.resume
      ? { conversationId: conversa, resume: decodificarRetomada(config.command.resume) }
      : {
          conversationId: conversa,
          message: textoDaMensagem(ultima).trim() || PERGUNTA_DA_FOTO,
          ...(anexadas.length ? { photos: anexadas } : {}),
        };
    try {
      yield* streamChat(corpo, { signal: config.abortSignal });
    } finally {
      aoFimDoTurno.current?.();
    }
  }, []);

  /**
   * O histórico da conversa e a pausa pendente. Conversa que ainda não existe no
   * servidor (acabou de ganhar id) é conversa vazia, não erro.
   */
  const load = useCallback(async (threadId: string) => {
    try {
      const conversa = await getConversation(threadId);
      const pausa = pausaPendente(conversa.messages);
      return {
        messages: historicoParaMensagens(conversa.messages),
        ...(pausa ? { interrupts: [pausa] } : {}),
      };
    } catch (erro) {
      if (erro instanceof ApiError && erro.isNotFound) return { messages: [] };
      throw erro;
    }
  }, []);

  /**
   * O voto é gravado **na hora**. Quem clica 👎 e fecha a tela já disse o mais
   * importante; o motivo, quando vem, chega num segundo envio (`enviarMotivo`).
   */
  const [votoPendente, setVotoPendente] = useState<string | null>(null);
  const feedback = useMemo<FeedbackAdapter>(
    () => ({
      submit: ({ message, type }) => {
        const conversa = conversaAtual.current;
        if (!conversa) return;
        const linha = linhas.current.get(message.id) ?? message.id;
        const negativo = type !== 'positive';
        void sendChatFeedback(conversa, linha, { review: negativo ? 'dislike' : 'like' }).catch(
          () => undefined,
        );
        setVotoPendente(negativo ? linha : null);
      },
    }),
    [],
  );

  const runtime = useLangGraphRuntime({
    threadId: conversationId,
    stream,
    load,
    // Sem isto o botão de parar não aparece e o `abortSignal` nunca dispara.
    unstable_allowCancellation: true,
    unstable_threadListAdapter: threadListAdapter,
    onThreadIdChange,
    adapters: { feedback, ...(fotos ? { attachments: adaptadorDeFoto } : {}) },
    eventHandlers: {
      onCustomEvent: (tipo, dados) => {
        const corpo = (dados ?? {}) as Record<string, unknown>;
        if (tipo === 'catalog' && corpo.tools && typeof corpo.tools === 'object') {
          setTitulos(corpo.tools as Record<string, string>);
        } else if (tipo === 'start') {
          setPlano(null);
        } else if (tipo === 'plan' && Array.isArray(corpo.steps)) {
          const conversa = conversaAtual.current;
          if (conversa) setPlano({ conversa, passos: corpo.steps as ChatPlanStep[] });
        } else if (tipo === 'artifact' && typeof corpo.toolCallId === 'string') {
          const id = corpo.toolCallId;
          setArtefatos((antes) => ({ ...antes, [id]: corpo as unknown as ChatArtifact }));
        } else if (
          tipo === 'persisted' &&
          typeof corpo.messageId === 'string' &&
          typeof corpo.assistantMessageId === 'string'
        ) {
          linhas.current.set(corpo.messageId, corpo.assistantMessageId);
        }
      },
    },
  });

  return {
    runtime,
    titulos,
    artefatos,
    plano: plano && plano.conversa === conversationId ? plano.passos : null,
    voto: {
      pendente: votoPendente,
      dispensar: () => setVotoPendente(null),
      enviarMotivo: async (linha: string, motivos: ChatReviewReason[], nota: string) => {
        const conversa = conversaAtual.current;
        if (!conversa) return false;
        try {
          await sendChatFeedback(conversa, linha, {
            review: 'dislike',
            reasons: motivos,
            note: nota || undefined,
          });
          setVotoPendente(null);
          return true;
        } catch {
          return false;
        }
      },
    },
  };
}
