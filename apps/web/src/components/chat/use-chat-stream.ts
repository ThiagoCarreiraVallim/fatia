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
  /** Texto para leitor de tela. Muda uma vez por resposta, nunca por token. */
  announcement: string;
  send: (texto: string) => Promise<void>;
  /** Reenvia a última mensagem do usuário. Existe para o erro não ser beco sem saída. */
  retry: () => Promise<void>;
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
  const [announcement, setAnnouncement] = useState('');
  const conversationId = useRef<string | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);
  const ultimaPergunta = useRef<string | null>(null);

  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setStatus('ready');
  }, []);

  const enviar = useCallback(async (texto: string) => {
    const pergunta = texto.trim();
    if (!pergunta) return;
    ultimaPergunta.current = pergunta;

    const idAssistente = proximoId('assistente');
    setMessages((atuais) => [
      ...atuais,
      { id: proximoId('voce'), role: 'user', text: pergunta, tools: [] },
      { id: idAssistente, role: 'assistant', text: '', tools: [] },
    ]);
    setStatus('submitted');
    setAnnouncement('');

    const controller = new AbortController();
    abort.current = controller;

    let houveErro = false;
    let ultima: ChatUiMessage = { id: idAssistente, role: 'assistant', text: '', tools: [] };

    const aplicar = (evento: ChatStreamEvent) =>
      setMessages((atuais) =>
        atuais.map((m) => {
          if (m.id !== idAssistente) return m;
          ultima = aplicarEvento(m, evento);
          return ultima;
        }),
      );

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
        aplicar(evento);
      }
    } finally {
      abort.current = null;
    }

    setStatus(houveErro ? 'error' : 'ready');
    // O anúncio sai **uma vez**, no fim. Anunciar token a token transformaria o
    // leitor de tela em ruído e a resposta em algo impossível de acompanhar —
    // por isso a região viva do `Conversation` fica calada (ver `chat-view`).
    if (houveErro) {
      setAnnouncement('A resposta falhou. O aviso está no fim da conversa.');
    } else {
      const usadas = ultima.tools.map((t) => t.name).join(', ');
      setAnnouncement(
        usadas
          ? `Fatia respondeu usando ${usadas}. A resposta está no fim da conversa.`
          : 'Fatia respondeu. A resposta está no fim da conversa.',
      );
    }
  }, []);

  const send = useCallback(
    async (texto: string) => {
      await enviar(texto);
    },
    [enviar],
  );

  const retry = useCallback(async () => {
    const pergunta = ultimaPergunta.current;
    if (!pergunta) return;
    // Remove o par (pergunta + resposta que falhou) antes de repetir, senão a
    // conversa fica com a mesma pergunta duas vezes na tela.
    setMessages((atuais) => atuais.slice(0, -2));
    await enviar(pergunta);
  }, [enviar]);

  return { messages, status, announcement, send, retry, stop };
}
