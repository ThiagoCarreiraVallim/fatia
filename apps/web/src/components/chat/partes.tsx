'use client';

import { AlertCircleIcon, CheckIcon } from 'lucide-react';
import { Streamdown } from 'streamdown';
import {
  useMessagePartText,
  type TextMessagePartComponent,
  type ToolCallMessagePartComponent,
} from '@assistant-ui/react';
import { SwapLabel } from '@/components/elements/surfaces';
import { useArtefato, useTitulosDasTools } from './chat-runtime-provider';
import { Artefato } from './artefato';

/**
 * As partes de uma mensagem do assistente: o texto em markdown e as tools.
 *
 * O texto continua no `streamdown`: o agente responde em markdown, e a família de
 * elements renderiza texto puro — trocar apagaria negrito, lista e tabela de
 * "seu almoço teve **42 g** de proteína".
 */

export const TextoDoAssistente: TextMessagePartComponent = () => {
  const { text } = useMessagePartText();
  return <Streamdown className="w-full text-sm leading-relaxed">{text}</Streamdown>;
};

/** A tool local do agente: a pergunta dela aparece no cartão da pausa. */
const TITULOS_LOCAIS: Record<string, string> = { ask_user: 'Pergunta para você' };

export type EstadoDoPasso = 'rodando' | 'aguardando' | 'feito' | 'falhou';

/** O que a linha diz em cada estado — só português, nunca o nome técnico da tool. */
export function rotuloDoPasso(titulo: string, estado: EstadoDoPasso): string {
  switch (estado) {
    case 'rodando':
      return `${titulo}…`;
    case 'aguardando':
      return `${titulo}: aguardando sua confirmação`;
    case 'falhou':
      return `${titulo}: não deu certo`;
    default:
      return titulo;
  }
}

/**
 * Uma chamada de tool, como uma linha de status: o que o assistente está fazendo
 * e se deu certo.
 *
 * **Sem nome técnico e sem JSON.** Quem conversa não lê `log_meal` nem
 * `{"foodId":163}`; o que importa a essa pessoa é "Registrar refeição ✓", e o
 * resultado que interessa já vem no texto da resposta e no artefato logo abaixo.
 * O título é o `title` que o `/mcp` anuncia para cada tool — pelo `catalog` do
 * turno ao vivo, e por `/chat/tools` depois de um F5.
 */
export const ChamadaDeTool: ToolCallMessagePartComponent = ({
  toolCallId,
  toolName,
  isError,
  status,
}) => {
  const titulos = useTitulosDasTools();
  const artefato = useArtefato(toolCallId);
  const estado: EstadoDoPasso =
    status.type === 'requires-action'
      ? 'aguardando'
      : status.type === 'running'
        ? 'rodando'
        : isError || (status.type === 'incomplete' && status.reason === 'error')
          ? 'falhou'
          : 'feito';
  const titulo = titulos[toolName] ?? TITULOS_LOCAIS[toolName] ?? 'Ação do assistente';
  const ativo = estado === 'rodando' || estado === 'aguardando';

  return (
    <div className="flex w-full flex-col gap-2">
      <p
        data-slot="passo"
        data-estado={estado}
        className="flex items-center gap-2 py-1 text-[13.5px] text-foreground/55"
      >
        <SwapLabel active={ativo ? 0 : 1} className="text-start">
          <span className="relative inline-block leading-none">
            <span>{rotuloDoPasso(titulo, estado)}</span>
            <span
              aria-hidden
              className="shimmer pointer-events-none absolute inset-0 motion-reduce:animate-none"
            >
              {rotuloDoPasso(titulo, estado)}
            </span>
          </span>
          <>{rotuloDoPasso(titulo, estado)}</>
        </SwapLabel>
        {estado === 'feito' ? (
          <CheckIcon
            aria-label="Feito"
            className="fade-in zoom-in-90 animate-in size-3.5 shrink-0 text-emerald-500 duration-200"
          />
        ) : null}
        {estado === 'falhou' ? (
          <AlertCircleIcon
            aria-hidden
            className="fade-in zoom-in-90 animate-in size-3.5 shrink-0 text-red-500 duration-200"
          />
        ) : null}
      </p>
      {artefato && estado === 'feito' ? <Artefato artefato={artefato} /> : null}
    </div>
  );
};
