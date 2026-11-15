'use client';

import { useEffect } from 'react';
import { useAui, useAuiState } from '@assistant-ui/react';
import { useConversaAberta } from './chat-runtime-provider';

/**
 * A mensagem que a pessoa escreveu no menu da IA (#369) e que abre uma
 * conversa nova. Fica só na memória desta aba, pelo tempo de navegar até a
 * conversa: não vai para a URL (histórico do navegador, logs do proxy) nem
 * para o `localStorage` (CLAUDE.md: nada de dado de sessão lá).
 */
const queued = new Map<string, string>();

export function queueFirstMessage(conversationId: string, text: string): void {
  queued.set(conversationId, text);
}

export function takeFirstMessage(conversationId: string | undefined): string | undefined {
  if (!conversationId) return undefined;
  const text = queued.get(conversationId);
  queued.delete(conversationId);
  return text;
}

/**
 * Manda a mensagem do menu assim que a conversa estiver pronta para receber,
 * com a mesma condição que libera o composer (ver `Composer` em `thread.tsx`):
 * antes disso, a chegada do runtime à conversa zeraria o que foi posto nele.
 */
export function DrawerMessage() {
  const aui = useAui();
  const open = useConversaAberta();
  const ready = useAuiState(
    (s) =>
      !s.thread.isLoading &&
      !s.thread.isRunning &&
      !(Boolean(open) && s.threadListItem?.remoteId !== open),
  );

  useEffect(() => {
    if (!ready || !queued.has(open ?? '')) return;
    const text = takeFirstMessage(open);
    if (!text) return;
    aui.composer().setText(text);
    aui.composer().send();
  }, [aui, open, ready]);

  return null;
}
