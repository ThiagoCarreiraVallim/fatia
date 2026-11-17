'use client';

import { useAui, useAuiState } from '@assistant-ui/react';
import { useLangGraphInterruptState } from '@assistant-ui/react-langgraph';
import { quickReplies, type ChatInterruptValue } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { ghostButton } from '@/components/elements/surfaces';

/**
 * As respostas rápidas acima do campo (prancha IA-Conversas): o próximo passo natural depois
 * da última consulta. Tocar manda o texto da pílula como mensagem. Com uma pausa na mesa, as
 * pílulas da pausa ficam no cartão dela, que é onde a resposta tem de sair.
 */
export function PilulasDeResposta() {
  const aui = useAui();
  const rodando = useAuiState((s) => s.thread.isRunning);
  const pausa = useLangGraphInterruptState()?.value as ChatInterruptValue | undefined;
  // Texto no seletor: o runtime compara por igualdade.
  const ultimaTool = useAuiState((s) => {
    const ultima = s.thread.messages.at(-1);
    if (ultima?.role !== 'assistant') return '';
    const tools = ultima.content.filter((p) => p.type === 'tool-call');
    const parte = tools.at(-1);
    return parte && parte.type === 'tool-call' ? parte.toolName : '';
  });
  if (pausa) return null;
  const pilulas = quickReplies({ lastTool: ultimaTool || null, running: rodando });
  if (pilulas.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Respostas rápidas"
      className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-2"
    >
      {pilulas.map((texto) => (
        <button
          key={texto}
          type="button"
          onClick={() => aui.thread().append(texto)}
          className={cn(
            ghostButton,
            'shrink-0 rounded-full border border-border px-3.5 py-1.5 text-sm text-foreground/80',
          )}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}
