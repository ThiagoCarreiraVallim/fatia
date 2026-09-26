import type { LangChainMessage } from '@assistant-ui/react-langgraph';
import type { ChatHistoryMessage, ChatTurnTiming } from '@fatia/api-client';

/**
 * O tempo de uma resposta, como a pessoa lê.
 *
 * Módulo puro porque a regra que ele carrega é fácil de errar num JSX: **medida
 * ausente não vira zero**. Um turno parado não tem `done` do agente, e um turno
 * que só pediu confirmação não tem primeiro caractere — mostrar "0 ms" nos dois
 * seria um número com cara de medido que ninguém mediu.
 */

export type TurnTiming = Partial<Pick<ChatTurnTiming, 'durationMs' | 'ttftMs'>>;

export interface TimingStat {
  label: string;
  value: string;
}

/** Um número em `ms` como a pessoa lê: `840 ms`, `1,2 s`, `1 min 4 s`. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) {
    // Vírgula, e não ponto: a tela é em português, e `toFixed` devolve ponto
    // qualquer que seja o idioma do aparelho.
    return `${seconds.toFixed(1).replace('.', ',')} s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds - minutes * 60)} s`;
}

/**
 * As linhas do rodapé de tempo. Vazio quando não há o que dizer.
 *
 * Sem contagem de tokens: "unidades de saída" é vocabulário de quem opera o
 * modelo, e a tela do chat foi limpa desse jargão (#268). O consumo fica gravado
 * para a cota e para quem audita, não para o rodapé.
 */
export function timingStats(timing: TurnTiming | undefined): TimingStat[] {
  if (!timing) return [];
  const stats: TimingStat[] = [];
  if (timing.ttftMs !== undefined) {
    stats.push({ label: 'começou em', value: formatDuration(timing.ttftMs) });
  }
  if (timing.durationMs !== undefined) {
    stats.push({ label: 'respondeu em', value: formatDuration(timing.durationMs) });
  }
  return stats;
}

/**
 * A resposta **como a tela a mostra** é um grupo, e o id dela é o da primeira fala.
 *
 * O assistant-ui junta as mensagens de IA seguidas (e os resultados de tool entre
 * elas) numa só, com o id da **primeira**. Um turno com tool tem duas mensagens de
 * IA; uma confirmação e a retomada são dois turnos, duas linhas no banco, e uma
 * resposta só na tela. Guardar o tempo pelo id da última mensagem — que é o que o
 * `persisted` traz — deixava o rodapé procurando por um id que a tela não usa.
 */
export interface AnswerGroup {
  /** O id com que a tela desenha a resposta. */
  displayId: string;
  /** As linhas do banco que a compõem, na ordem. A última é a mais recente. */
  rows: ChatHistoryMessage[];
}

/** Linha que vira mensagem na tela — as outras `historicoParaMensagens` pula. */
const isShown = (row: ChatHistoryMessage): boolean =>
  row.content !== '' || (row.tools?.length ?? 0) > 0;

export function answerGroups(rows: readonly ChatHistoryMessage[]): AnswerGroup[] {
  const groups: AnswerGroup[] = [];
  let open: AnswerGroup | null = null;
  for (const row of rows) {
    if (row.role === 'user') {
      if (row.content) open = null;
      continue;
    }
    if (!open) {
      if (!isShown(row)) continue;
      open = { displayId: row.id, rows: [] };
      groups.push(open);
    }
    open.rows.push(row);
  }
  return groups;
}

/** O tempo de cada resposta do histórico, pelo id da tela — o da linha mais recente do grupo. */
export function timingsFromHistory(
  rows: readonly ChatHistoryMessage[],
): Record<string, TurnTiming> {
  const timings: Record<string, TurnTiming> = {};
  for (const group of answerGroups(rows)) {
    const metadata = group.rows.at(-1)?.metadata;
    const { durationMs, ttftMs } = metadata ?? {};
    if (durationMs === undefined && ttftMs === undefined) continue;
    timings[group.displayId] = {
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(ttftMs !== undefined ? { ttftMs } : {}),
    };
  }
  return timings;
}

/** As respostas cuja parte mais recente a pessoa parou, pelo id da tela. */
export function stoppedFromHistory(rows: readonly ChatHistoryMessage[]): string[] {
  return answerGroups(rows)
    .filter((group) => group.rows.at(-1)?.metadata?.status === 'stopped')
    .map((group) => group.displayId);
}

/** Id da tela → linha do banco onde o voto grava: a mais recente do grupo. */
export function voteRowsFromHistory(rows: readonly ChatHistoryMessage[]): Map<string, string> {
  return new Map(
    answerGroups(rows).map((group) => [group.displayId, group.rows.at(-1)?.id ?? group.displayId]),
  );
}

/**
 * O id com que a tela vai desenhar a resposta do turno que está começando, se ele
 * já existe: numa retomada, a resposta continua a mensagem de IA de antes da
 * pausa. Num turno novo não há ainda — vem do primeiro quadro de IA.
 */
export function openAnswerId(messages: readonly LangChainMessage[]): string | undefined {
  let answerId: string | undefined;
  for (const message of messages) {
    if (message.type === 'human') answerId = undefined;
    else if (message.type === 'ai' && answerId === undefined) answerId = message.id;
  }
  return answerId;
}

/** O que o `done` trouxe, se for medida de verdade: inteiro, não negativo. */
export function timingFromDone(data: unknown): TurnTiming | null {
  if (!data || typeof data !== 'object') return null;
  const { durationMs, ttftMs } = data as Record<string, unknown>;
  const timing: TurnTiming = {
    ...(isMilliseconds(durationMs) ? { durationMs } : {}),
    ...(isMilliseconds(ttftMs) ? { ttftMs } : {}),
  };
  return Object.keys(timing).length > 0 ? timing : null;
}

const isMilliseconds = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;
