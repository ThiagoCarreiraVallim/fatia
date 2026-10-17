import type { ChatStreamFrame } from '@fatia/api-client';

/** O nome com que um erro sem resposta chega ao `onCustomEvent`. */
export const TURN_ERROR_EVENT = 'turn_error';

/**
 * Tira do caminho do runtime o erro que chega **antes** de o turno ter resposta.
 *
 * O `useLangGraphRuntime` trata `error` sozinho: marca como falha a última
 * mensagem de IA que ele conhece. Só que ele conhece a conversa inteira. Um erro
 * que chega antes da primeira palavra do turno — cota, provedor fora, token
 * vencido — ia parar na resposta do turno **anterior**, que estava certa, e o
 * turno de agora ficava sem aviso nenhum: a pergunta ali, sem resposta e sem erro.
 *
 * Então, até aparecer uma mensagem de IA deste turno, `error` vira
 * `turn_error`, que a biblioteca entrega ao `onCustomEvent` sem mexer em
 * mensagem nenhuma. Depois disso o `error` passa como veio: aí a última mensagem
 * de IA é mesmo a deste turno.
 */
export async function* separateTurnError(
  frames: AsyncIterable<ChatStreamFrame>,
): AsyncGenerator<ChatStreamFrame> {
  let answered = false;
  for await (const frame of frames) {
    if (frame.event === 'error' && !answered) {
      yield { event: TURN_ERROR_EVENT, data: frame.data };
      continue;
    }
    if (!answered && carriesAiMessage(frame)) answered = true;
    yield frame;
  }
}

/** O id da primeira mensagem de IA que o quadro carrega, se carrega. */
export function aiMessageIdIn(frame: ChatStreamFrame): string | undefined {
  for (const message of aiMessagesIn(frame)) {
    const id = (message as { id?: unknown }).id;
    if (typeof id === 'string') return id;
  }
  return undefined;
}

function carriesAiMessage(frame: ChatStreamFrame): boolean {
  return aiMessagesIn(frame).length > 0;
}

function aiMessagesIn(frame: ChatStreamFrame): unknown[] {
  if (frame.event === 'messages' || frame.event === 'messages/complete') {
    return Array.isArray(frame.data) ? frame.data.filter(isAiMessage) : [];
  }
  if (frame.event !== 'updates' || !frame.data || typeof frame.data !== 'object') return [];
  return Object.entries(frame.data as Record<string, unknown>).flatMap(([node, content]) => {
    if (node === '__interrupt__' || !content || typeof content !== 'object') return [];
    const messages = (content as { messages?: unknown }).messages;
    return Array.isArray(messages) ? messages.filter(isAiMessage) : [];
  });
}

function isAiMessage(message: unknown): boolean {
  if (!message || typeof message !== 'object') return false;
  const type = (message as { type?: unknown }).type;
  return type === 'ai' || type === 'AIMessageChunk';
}
