'use client';

import { useState, type ReactNode } from 'react';
import { AlertCircleIcon, CheckIcon } from 'lucide-react';
import { Streamdown } from 'streamdown';
import {
  useAuiState,
  useMessagePartText,
  type ReasoningMessagePartComponent,
  type TextMessagePartComponent,
  type ToolCallMessagePartComponent,
} from '@assistant-ui/react';
import { ReasoningPanel } from '@/components/elements/reasoning-panel';
import { ToolGroup } from '@/components/elements/tool-group';
import { SwapLabel } from '@/components/elements/surfaces';
import { useArtefato, useArtefatos, useTitulosDasTools } from './chat-runtime-provider';
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

/**
 * O raciocínio do modelo, colapsado. Não é gravado: depois de um F5, a resposta
 * volta sem ele — o que fica no histórico é o que o modelo respondeu, e não o
 * rascunho (ver `events._with_reasoning` no agente).
 */
export const AssistantReasoning: ReasoningMessagePartComponent = ({ text, status }) => (
  <ReasoningPanel
    text={text}
    streaming={status.type === 'running'}
    activeLabel="Pensando…"
    label="Como pensei"
  />
);

/** A tool local do agente: a pergunta dela aparece no cartão da pausa. */
const TITULOS_LOCAIS: Record<string, string> = { ask_user: 'Pergunta para você' };

export type StepState = 'rodando' | 'aguardando' | 'feito' | 'falhou' | 'recusada' | 'nao_rodou';

/**
 * Os dois desfechos que o próprio agente escreve, e que não são falha da tool:
 * a pessoa recusou a escrita, ou a conversa seguiu antes de ela rodar. Casados
 * pelo texto — é o que atravessa o fio —, e `contrato-das-tools.test.ts` lê as
 * constantes do agente para o texto daqui não ficar para trás.
 */
export const REFUSED_PREFIX = 'A pessoa recusou';
export const NOT_RUN_PREFIX = 'Não executada';

/** O que a linha diz em cada estado — só português, nunca o nome técnico da tool. */
export function stepLabel(titulo: string, estado: StepState): string {
  switch (estado) {
    case 'rodando':
      return `${titulo}…`;
    case 'aguardando':
      return `${titulo}: aguardando sua confirmação`;
    case 'falhou':
      return `${titulo}: não deu certo`;
    case 'recusada':
      return `${titulo}: você recusou, nada foi gravado`;
    case 'nao_rodou':
      return `${titulo}: não chegou a rodar`;
    default:
      return titulo;
  }
}

export function stepState(
  status: { type: string; reason?: string },
  isError: boolean | undefined,
  result: unknown,
): StepState {
  if (status.type === 'requires-action') return 'aguardando';
  if (status.type === 'running') return 'rodando';
  const falhou = isError || (status.type === 'incomplete' && status.reason === 'error');
  if (!falhou) return 'feito';
  const texto = typeof result === 'string' ? result : '';
  if (texto.startsWith(REFUSED_PREFIX)) return 'recusada';
  if (texto.startsWith(NOT_RUN_PREFIX)) return 'nao_rodou';
  return 'falhou';
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
 *
 * Quando falha, o motivo fica atrás de um toque: ele vem do servidor e pode ser
 * técnico, e a linha continua dizendo em português o que aconteceu.
 */
export const ToolCallPart: ToolCallMessagePartComponent = ({
  toolCallId,
  toolName,
  isError,
  status,
  result,
}) => {
  const titulos = useTitulosDasTools();
  const artefato = useArtefato(toolCallId);
  const [detalhe, setDetalhe] = useState(false);
  const estado = stepState(status, isError, result);
  const titulo = titulos[toolName] ?? TITULOS_LOCAIS[toolName] ?? 'Ação do assistente';
  const ativo = estado === 'rodando' || estado === 'aguardando';
  const motivo = estado === 'falhou' && typeof result === 'string' ? result.trim() : '';

  return (
    <div className="flex w-full flex-col gap-2">
      <p
        data-slot="passo"
        data-estado={estado}
        className="flex items-center gap-2 py-1 text-[13.5px] text-foreground/55"
      >
        <SwapLabel active={ativo ? 0 : 1} className="text-start">
          <span className="relative inline-block leading-none">
            <span>{stepLabel(titulo, estado)}</span>
            <span
              aria-hidden
              className="shimmer pointer-events-none absolute inset-0 motion-reduce:animate-none"
            >
              {stepLabel(titulo, estado)}
            </span>
          </span>
          <>{stepLabel(titulo, estado)}</>
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
        {motivo ? (
          <button
            type="button"
            aria-expanded={detalhe}
            onClick={() => setDetalhe((aberto) => !aberto)}
            className="ml-1 text-xs underline underline-offset-2 hover:text-foreground/80"
          >
            {detalhe ? 'Ocultar detalhe' : 'Ver detalhe'}
          </button>
        ) : null}
      </p>
      {motivo && detalhe ? (
        <p className="max-w-full whitespace-pre-wrap break-words rounded-xl bg-foreground/[0.04] px-3 py-2 text-xs text-foreground/60">
          {motivo}
        </p>
      ) : null}
      {artefato && estado === 'feito' ? <Artefato artefato={artefato} /> : null}
    </div>
  );
};

/** A partir de quantas tools seguidas o grupo resume — com menos, o cabeçalho é ruído. */
export const TOOL_GROUP_MIN = 3;

/**
 * Tools seguidas numa resposta, resumidas num cabeçalho.
 *
 * **Nunca agrupa quando alguma falhou.** A falha é o que a pessoa mais precisa
 * ver, e escondê-la atrás de "Consultei 4 coisas ✓" seria dizer que deu tudo certo.
 */
export function ToolCallGroup({
  startIndex,
  endIndex,
  children,
}: {
  startIndex: number;
  endIndex: number;
  children?: ReactNode;
}) {
  const artefatos = useArtefatos();
  // O seletor devolve texto, e não o recorte das partes: um array novo a cada
  // leitura faria o runtime achar que mudou e redesenhar sem parar.
  const resumo = useAuiState((s) => {
    const partes = s.message.parts.slice(startIndex, endIndex + 1);
    const ids = partes.flatMap((parte) => (parte.type === 'tool-call' ? [parte.toolCallId] : []));
    // As duas formas de falha que o passo mostra (ver `stepState`): o resultado
    // com erro, e o turno que caiu no meio da tool.
    const falhou = partes.some(
      (parte) =>
        parte.type === 'tool-call' &&
        (parte.isError === true ||
          (parte.status?.type === 'incomplete' && parte.status.reason === 'error')),
    );
    const rodando = partes.some((parte) => parte.status?.type === 'running');
    return `${falhou ? 1 : 0}${rodando ? 1 : 0}${ids.join('\u0000')}`;
  });
  const algumaFalhou = resumo[0] === '1';
  const rodando = resumo[1] === '1';
  const ids = resumo.length > 2 ? resumo.slice(2).split('\u0000') : [];
  if (ids.length < TOOL_GROUP_MIN || algumaFalhou) return <>{children}</>;
  const temCartao = ids.some((id) => artefatos[id] !== undefined);
  return (
    <ToolGroup label={`Consultei ${ids.length} coisas`} defaultOpen={rodando || temCartao}>
      {children}
    </ToolGroup>
  );
}
