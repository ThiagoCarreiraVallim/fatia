'use client';

import { useCallback, useState } from 'react';
import { useLangGraphInterruptState, useLangGraphSendCommand } from '@assistant-ui/react-langgraph';
import type { ChatInterruptValue, ChatResumeValue } from '@fatia/api-client';
import { AskUser } from './ask-user';
import { codificarRetomada } from './historico';

/**
 * A pausa do agente, ligada ao runtime.
 *
 * O `interrupt` do LangGraph é a fonte: enquanto ele existe, o grafo está
 * parado, e responder é mandar um `Command` de volta. O id da pausa viaja na
 * resposta porque é o que prova que ela corresponde à pausa pendente — o agente
 * recusa com 409 um id que não bate (ADR 023).
 */
export function PausaDoAgente() {
  const pausa = useLangGraphInterruptState();
  const enviarComando = useLangGraphSendCommand();
  const [ocupado, setOcupado] = useState(false);

  const responder = useCallback(
    async (resposta: ChatResumeValue) => {
      if (!pausa) return;
      setOcupado(true);
      try {
        // O `id` não está no tipo da biblioteca, mas vem no fio (`__interrupt__`).
        const id = (pausa as { id?: string }).id ?? '';
        await enviarComando({ resume: codificarRetomada(id, resposta) });
      } finally {
        setOcupado(false);
      }
    },
    [pausa, enviarComando],
  );

  const valor = pausa?.value as ChatInterruptValue | undefined;
  if (!valor || !Array.isArray(valor.actions)) return null;

  return <AskUser pausa={valor} ocupado={ocupado} onResponder={(r) => void responder(r)} />;
}
