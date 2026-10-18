'use client';

import { useEffect } from 'react';
import { useAui, useAuiState } from '@assistant-ui/react';
import { useLangGraphSend } from '@assistant-ui/react-langgraph';
import { useLiveJoin } from './chat-runtime-provider';

/**
 * Volta a acompanhar a resposta que ainda corre no servidor (ADR 035): F5,
 * outra aba, conversa reaberta depois de sair da tela.
 *
 * Entra como um turno sem mensagem nova (`runConfig.join`), então a tela é a de
 * quem nunca saiu: indicador, tools, botão de parar. Se a resposta acabou entre
 * o `load` e o join, recarrega o histórico — só nesse caso: recarregar depois de
 * acompanhar trocaria os ids e duplicaria a resposta. (Mesmo desenho da Lunia.)
 */
export function LiveJoin() {
  const join = useLiveJoin();
  const send = useLangGraphSend();
  const aui = useAui();
  const livre = useAuiState((s) => !s.thread.isLoading && !s.thread.isRunning);

  useEffect(() => {
    if (!join.pending || !livre) return;
    join.consume();
    void send([], { runConfig: { join: true } })
      .then(() => {
        if (join.missed()) return aui.thread().unstable_refetchThread?.();
      })
      .catch(() => undefined);
  }, [aui, livre, join, send]);

  return null;
}
