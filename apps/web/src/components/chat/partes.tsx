'use client';

import { useState, type ReactNode } from 'react';
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  LoaderCircleIcon,
  PauseIcon,
  XIcon,
} from 'lucide-react';
import { Streamdown } from 'streamdown';
import {
  useAuiState,
  useMessagePartText,
  type ReasoningMessagePartComponent,
  type TextMessagePartComponent,
  type ToolCallMessagePartComponent,
} from '@assistant-ui/react';
import {
  AGENT_LOCAL_TOOLS,
  chatCardTitle,
  collapsedLabel,
  isEmptyChatArtifact,
  TOOL_GROUP_MIN,
  webSearchLineLabel,
  type ToolCallStatus,
} from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { ReasoningPanel } from '@/components/elements/reasoning-panel';
import { ToolGroup } from '@/components/elements/tool-group';
import { SwapLabel } from '@/components/elements/surfaces';
import { useArtefato, useArtefatos, useTitulosDasTools } from './chat-runtime-provider';
import { ChatArtifactCard } from './artefato';
import { useCatalogoDasTools } from './catalogo';

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

export type StepState =
  'rodando' | 'aguardando' | 'feito' | 'vazio' | 'falhou' | 'recusada' | 'nao_rodou';

/**
 * Os dois desfechos que o próprio agente escreve, e que não são falha da tool:
 * a pessoa recusou a escrita, ou a conversa seguiu antes de ela rodar. Casados
 * pelo texto — é o que atravessa o fio —, e `contrato-das-tools.test.ts` lê as
 * constantes do agente para o texto daqui não ficar para trás.
 */
export const REFUSED_PREFIX = 'A pessoa recusou';
export const NOT_RUN_PREFIX = 'Não executada';

/**
 * O que a linha diz em cada estado — só português, nunca o nome técnico da tool. O desfecho
 * vem depois de um "·", como na prancha IA-Estados ("Atualizar exercício · não deu certo").
 * `gravacao`: a tool grava (a linha não diz "Consultando").
 */
export function stepLabel(titulo: string, estado: StepState, gravacao = false): string {
  switch (estado) {
    case 'rodando':
      return gravacao ? `${titulo}…` : `Consultando ${titulo}…`;
    case 'aguardando':
      return `${titulo} · aguardando sua confirmação`;
    case 'vazio':
      return `${titulo} · nada encontrado`;
    case 'falhou':
      return `${titulo} · não deu certo`;
    case 'recusada':
      return `${titulo} · você recusou`;
    case 'nao_rodou':
      return `${titulo} · não chegou a rodar`;
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

const STATUS_DA_LINHA: Record<StepState, ToolCallStatus> = {
  rodando: 'running',
  aguardando: 'pending',
  feito: 'done',
  vazio: 'empty',
  falhou: 'error',
  recusada: 'declined',
  nao_rodou: 'not_run',
};

/** "Título · resultado": o resultado em destaque, como na prancha IA-Estados. */
function RotuloDaLinha({ texto, falhou }: { texto: string; falhou: boolean }) {
  const corte = texto.indexOf(' · ');
  if (corte < 0) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, corte)} ·{' '}
      <span className={cn('font-semibold', falhou ? 'text-danger' : 'text-foreground')}>
        {texto.slice(corte + 3)}
      </span>
    </>
  );
}

/** O selo redondo à esquerda da linha: ✓, vazio, erro, rodando ou interrompida. */
export function SeloDaLinha({
  tipo,
}: {
  tipo: 'feito' | 'vazio' | 'falhou' | 'rodando' | 'neutro' | 'parada';
}) {
  if (tipo === 'rodando') {
    return (
      <LoaderCircleIcon
        aria-hidden
        className="size-5 shrink-0 animate-spin text-success motion-reduce:animate-none"
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full',
        tipo === 'feito' && 'bg-primary/15 text-success',
        tipo === 'falhou' && 'bg-danger/15 text-danger',
        (tipo === 'vazio' || tipo === 'neutro' || tipo === 'parada') &&
          'bg-foreground/[0.08] text-foreground/55',
      )}
    >
      {tipo === 'feito' ? <CheckIcon className="size-3.5" /> : null}
      {tipo === 'falhou' ? <AlertCircleIcon className="size-3.5" /> : null}
      {tipo === 'vazio' ? <XIcon className="size-3.5" /> : null}
      {tipo === 'parada' ? <PauseIcon className="size-3.5" /> : null}
    </span>
  );
}

/** A caixa da linha: pílula cinza da largura da conversa (prancha IA-Estados, "Consultando"). */
export const caixaDaLinha =
  'flex w-full items-center gap-2.5 rounded-2xl bg-foreground/[0.04] px-3 py-2.5 text-start text-[13.5px] text-foreground/65 dark:bg-foreground/[0.06]';

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
  const catalogo = useCatalogoDasTools();
  const artefato = useArtefato(toolCallId);
  // Texto, e não objeto, no seletor: o runtime compara por igualdade.
  const ultima = useAuiState((s) => s.message.isLast);
  const criadaEm = useAuiState((s) => s.message.createdAt?.getTime() ?? 0);
  const [detalhe, setDetalhe] = useState(false);
  const [aberto, setAberto] = useState(false);
  const bruto = stepState(status, isError, result);
  const estado = bruto === 'feito' && artefato && isEmptyChatArtifact(artefato) ? 'vazio' : bruto;
  const local = AGENT_LOCAL_TOOLS[toolName as keyof typeof AGENT_LOCAL_TOOLS];
  const titulo =
    titulos[toolName] ?? catalogo?.[toolName]?.title ?? local?.title ?? 'Ação do assistente';
  const gravacao = catalogo?.[toolName]?.kind === 'confirm';
  const ativo = estado === 'rodando' || estado === 'aguardando';
  const motivo = estado === 'falhou' && typeof result === 'string' ? result.trim() : '';
  const cartao = estado === 'feito' && artefato ? artefato : null;
  const hora =
    gravacao && estado === 'feito' && criadaEm
      ? new Date(criadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;
  const busca = toolName === 'web_search';
  const sites = artefato?.kind === 'sources' ? artefato.sources.length : undefined;
  const rotulo = busca
    ? webSearchLineLabel(STATUS_DA_LINHA[estado], sites)
    : hora
      ? `${titulo} · gravado às ${hora}`
      : stepLabel(titulo, estado, gravacao);
  // A busca diz o que sai dela (prancha Al-M16): só a pergunta, sem nome nem dados.
  const avisoDaBusca =
    busca && (estado === 'rodando' || estado === 'feito' || estado === 'vazio') ? (
      <p className="px-1 text-xs text-muted-foreground">
        Só a pergunta vai a um serviço de busca, sem seu nome nem seus dados.
      </p>
    ) : null;
  // A escrita à espera do sim já está no cartão logo abaixo: uma linha a mais só repetiria.
  if (estado === 'aguardando') return null;

  // O cartão da última resposta fica aberto, com o nome da tool no cabeçalho dele; o de uma
  // resposta antiga recolhe numa linha com ✓ e o resultado, e tocar abre de novo.
  if (cartao && ultima) {
    return (
      <div className="flex w-full flex-col gap-2">
        <ChatArtifactCard artifact={cartao} toolTitle={titulo} />
        {avisoDaBusca}
      </div>
    );
  }
  if (cartao) {
    return (
      <div className="flex w-full flex-col gap-2">
        <button
          type="button"
          aria-expanded={aberto}
          onClick={() => setAberto((a) => !a)}
          className={cn(caixaDaLinha, 'hover:text-foreground/85')}
        >
          <SeloDaLinha tipo="feito" />
          <span className="min-w-0 flex-1 truncate">
            <RotuloDaLinha
              texto={busca ? rotulo : `${titulo} · ${chatCardTitle(cartao)}`}
              falhou={false}
            />
          </span>
          <ChevronDownIcon
            aria-hidden
            className={cn(
              'size-4 shrink-0 opacity-60 transition-transform',
              aberto && 'rotate-180',
            )}
          />
        </button>
        {avisoDaBusca}
        {aberto ? <ChatArtifactCard artifact={cartao} toolTitle={titulo} /> : null}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <p data-slot="passo" data-estado={estado} className={caixaDaLinha}>
        <SeloDaLinha
          tipo={
            estado === 'rodando'
              ? 'rodando'
              : estado === 'feito'
                ? 'feito'
                : estado === 'falhou'
                  ? 'falhou'
                  : estado === 'vazio'
                    ? 'vazio'
                    : 'neutro'
          }
        />
        <SwapLabel active={ativo ? 0 : 1} className="min-w-0 flex-1 text-start">
          <span className="relative inline-block leading-none">
            <span>{rotulo}</span>
            <span
              aria-hidden
              className="shimmer pointer-events-none absolute inset-0 motion-reduce:animate-none"
            >
              {rotulo}
            </span>
          </span>
          <span>
            <RotuloDaLinha texto={rotulo} falhou={estado === 'falhou'} />
          </span>
        </SwapLabel>
        {estado === 'feito' ? <span className="sr-only">Feito</span> : null}
        {motivo ? (
          <button
            type="button"
            aria-expanded={detalhe}
            onClick={() => setDetalhe((aberto) => !aberto)}
            className="ml-1 shrink-0 text-xs text-foreground/55 underline underline-offset-2 hover:text-foreground/80"
          >
            {detalhe ? 'Ocultar detalhe' : 'Ver detalhe'}
          </button>
        ) : null}
      </p>
      {avisoDaBusca}
      {motivo && detalhe ? (
        <p className="max-w-full whitespace-pre-wrap break-words rounded-xl bg-foreground/[0.04] px-3 py-2 text-xs text-foreground/60">
          {motivo}
        </p>
      ) : null}
    </div>
  );
};

/**
 * Tools seguidas numa resposta, resumidas num cabeçalho — a partir de duas (`TOOL_GROUP_MIN`,
 * prancha IA-Cartoes: "Depois de 2 seguidas, agrupa").
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
    <ToolGroup label={collapsedLabel(ids.length)} defaultOpen={rodando || temCartao}>
      {children}
    </ToolGroup>
  );
}
