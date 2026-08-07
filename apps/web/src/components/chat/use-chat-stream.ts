'use client';

import { useCallback, useRef, useState } from 'react';
import {
  streamChat,
  type ChatStreamError,
  type ChatStreamEvent,
  type ChatToolCall,
} from '@fatia/api-client';

/** Os mesmos nomes que `PromptInputSubmit` já entende, para não traduzir duas vezes. */
export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error';

export interface ChatUiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Tools chamadas durante **esta** resposta, na ordem em que o agente chamou. */
  tools: ChatToolCall[];
  /** Preenchido quando a resposta terminou mal. O texto já recebido continua. */
  error?: ChatStreamError;
}

let sequencia = 0;
function proximoId(prefixo: string): string {
  sequencia += 1;
  return `${prefixo}-${sequencia}`;
}

/**
 * Aplica um evento do SSE sobre a mensagem do assistente em construção.
 *
 * Separado do hook, e puro, porque é a regra que o teste precisa exercitar sem
 * montar a árvore inteira: token concatena, tool casa por `id` (o segundo quadro
 * da mesma tool traz o resultado e **substitui**, não duplica).
 */
export function aplicarEvento(mensagem: ChatUiMessage, evento: ChatStreamEvent): ChatUiMessage {
  switch (evento.type) {
    case 'token':
      return { ...mensagem, text: mensagem.text + evento.text };
    case 'tool': {
      const indice = mensagem.tools.findIndex((t) => t.id === evento.tool.id);
      if (indice === -1) return { ...mensagem, tools: [...mensagem.tools, evento.tool] };
      const tools = [...mensagem.tools];
      tools[indice] = { ...tools[indice], ...evento.tool };
      return { ...mensagem, tools };
    }
    case 'error':
      return { ...mensagem, error: evento.error };
    default:
      return mensagem;
  }
}

export interface UseChatStream {
  messages: ChatUiMessage[];
  status: ChatStatus;
  /** Id da resposta que está sendo escrita agora — é onde o "pensando" aparece. */
  respondendoId: string | null;
  /** Texto para leitor de tela. Muda uma vez por resposta, nunca por token. */
  announcement: string;
  send: (texto: string) => Promise<void>;
  /**
   * Refaz **aquela** resposta que falhou, identificada pelo id.
   *
   * Recebe o id em vez de assumir "a última": o aviso de erro continua na tela
   * do turno que falhou mesmo depois da conversa seguir, e o botão dele tem de
   * repetir a pergunta daquele turno — não a pergunta mais recente.
   */
  retry: (idAssistente: string) => Promise<void>;
  stop: () => void;
}

/**
 * Estado da conversa do PWA.
 *
 * O `conversationId` chega no primeiro evento do stream e viaja nas mensagens
 * seguintes — é ele que faz a segunda pergunta continuar a mesma conversa. Fica
 * em `ref` porque precisa estar atualizado dentro do laço do stream, sem esperar
 * o re-render.
 */
export function useChatStream(): UseChatStream {
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>('ready');
  const [respondendoId, setRespondendoId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const conversationId = useRef<string | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);

  /**
   * A lista também vive num `ref`, e é ele a fonte de verdade dentro do laço.
   *
   * O estado do React só é lido no render; o `retry` precisa saber **agora** qual
   * pergunta acompanha a resposta que falhou, e o anúncio precisa saber quais
   * tools entraram na resposta que acabou de fechar. Ler isso de dentro de um
   * updater de `setState` seria um efeito colateral em função que o React pode
   * chamar duas vezes ou tarde demais.
   */
  const lista = useRef<ChatUiMessage[]>([]);
  const atualizar = useCallback((f: (atuais: ChatUiMessage[]) => ChatUiMessage[]) => {
    lista.current = f(lista.current);
    setMessages(lista.current);
  }, []);

  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setStatus('ready');
    setRespondendoId(null);
    setAnnouncement('Resposta interrompida.');
  }, []);

  /** Roda o stream escrevendo na mensagem de assistente já criada. */
  const responder = useCallback(
    async (pergunta: string, idAssistente: string) => {
      setStatus('submitted');
      setRespondendoId(idAssistente);
      setAnnouncement('');

      const controller = new AbortController();
      abort.current = controller;

      let houveErro = false;
      try {
        for await (const evento of streamChat(
          { message: pergunta, conversationId: conversationId.current },
          { signal: controller.signal },
        )) {
          if (evento.type === 'conversation') {
            conversationId.current = evento.conversationId;
            continue;
          }
          if (evento.type === 'done') continue;
          if (evento.type === 'error') houveErro = true;
          if (evento.type === 'token') setStatus('streaming');
          atualizar((atuais) =>
            atuais.map((m) => (m.id === idAssistente ? aplicarEvento(m, evento) : m)),
          );
        }
      } finally {
        if (abort.current === controller) abort.current = null;
      }

      // Interrompido: quem apertou "parar" já viu o status voltar e recebeu o
      // anúncio de interrupção. Dizer "Fatia respondeu" aqui mandaria quem usa
      // leitor de tela procurar no fim da conversa um texto cortado no meio.
      if (controller.signal.aborted) return;

      setStatus(houveErro ? 'error' : 'ready');
      setRespondendoId(null);
      // O anúncio sai **uma vez**, no fim. Anunciar token a token transformaria o
      // leitor de tela em ruído e a resposta em algo impossível de acompanhar —
      // por isso a região viva do `Conversation` fica calada (ver `chat-view`).
      if (houveErro) {
        setAnnouncement('A resposta falhou. O aviso está no fim da conversa.');
        return;
      }
      const final = lista.current.find((m) => m.id === idAssistente);
      const usadas = (final?.tools ?? []).map((t) => t.name).join(', ');
      setAnnouncement(
        usadas
          ? `Fatia respondeu usando ${usadas}. A resposta está no fim da conversa.`
          : 'Fatia respondeu. A resposta está no fim da conversa.',
      );
    },
    [atualizar],
  );

  const send = useCallback(
    async (texto: string) => {
      const pergunta = texto.trim();
      if (!pergunta) return;
      // A recusa vem **antes** de mexer na lista: dois streams brigariam pela
      // mesma lista e pelo mesmo status, e recusar depois de já ter escrito
      // deixaria na tela um balão vazio que nunca vai ser preenchido.
      if (abort.current) return;
      const idAssistente = proximoId('assistente');
      atualizar((atuais) => [
        ...atuais,
        { id: proximoId('voce'), role: 'user', text: pergunta, tools: [] },
        { id: idAssistente, role: 'assistant', text: '', tools: [] },
      ]);
      await responder(pergunta, idAssistente);
    },
    [atualizar, responder],
  );

  const retry = useCallback(
    async (idAssistente: string) => {
      // Idem ao `send`: recusar depois de limpar o aviso faria o erro sumir da
      // tela sem nada ter acontecido, e o turno ficaria vazio e sem saída.
      if (abort.current) return;
      const indice = lista.current.findIndex((m) => m.id === idAssistente);
      if (indice <= 0) return;
      const anterior = lista.current[indice - 1];
      if (anterior.role !== 'user') return;

      // A resposta que falhou é limpa **no lugar**, e a pergunta fica onde está:
      // repetir um turno do meio não pode reordenar a conversa nem duplicar o que
      // a pessoa escreveu.
      atualizar((atuais) =>
        atuais.map((m) =>
          m.id === idAssistente ? { id: m.id, role: 'assistant', text: '', tools: [] } : m,
        ),
      );
      await responder(anterior.text, idAssistente);
    },
    [atualizar, responder],
  );

  return { messages, status, respondendoId, announcement, send, retry, stop };
}
