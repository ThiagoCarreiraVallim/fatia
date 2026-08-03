import { addDaysIso } from '../../progress/helpers/date-tz';
import type { BlockFocus } from './block-template';

/**
 * Reconciliação de calendário do bloco (#145).
 *
 * O item que a issue chama de **caso comum, não exceção**: falta, lesão, viagem.
 * "Um plano que quebra na primeira semana perdida não serve."
 *
 * Função pura de propósito, e não um método que grava. Dois motivos:
 *
 * 1. `get_training_block` declara `readOnlyHint: true`. Reconciliar gravando faria
 *    a leitura mudar estado — o mesmo erro que o `DashboardService` já documenta
 *    para conquistas, onde "quanto comi hoje?" chegou a criar sete linhas.
 * 2. Contador de andamento persistido mente sozinho. Sessão apagada, ou registrada
 *    retroativamente, deixaria `sessionsDone` divergente do histórico real — e a
 *    periodização inteira decidiria errado sem nenhum sintoma. Recontar do
 *    histórico é a única forma de a resposta não poder divergir dele.
 *
 * O que o banco guarda é a intenção (semana planejada, fatores, meta); o que sai
 * daqui é o andamento.
 */

/** Semanas seguidas sem NENHUMA sessão até o bloco ser dado como abandonado. */
export const MAX_MISSED_WEEKS = 3;

/** Uma linha de `TrainingBlockWeek` — o combinado, congelado na criação. */
export interface PlannedWeek {
  weekNumber: number;
  focus: BlockFocus;
  intensityFactor: number;
  volumeFactor: number;
  /** Segunda-feira planejada, YYYY-MM-DD. */
  weekStart: string;
  sessionsTarget: number;
}

export type WeekState = 'done' | 'partial' | 'current' | 'upcoming' | 'missed';

export interface ReconciledWeek extends PlannedWeek {
  /** Segunda-feira em que a semana de fato caiu, depois das reancoragens. */
  effectiveWeekStart: string;
  /** Domingo correspondente. */
  effectiveWeekEnd: string;
  sessionsDone: number;
  /** Quantas vezes ESTA semana foi perdida por inteiro e reancorada adiante. */
  shiftedWeeks: number;
  state: WeekState;
}

export type BlockStatus = 'active' | 'completed' | 'abandoned';

export interface ReconciledBlock {
  status: BlockStatus;
  weeks: ReconciledWeek[];
  /** `null` quando o bloco fechou (completo ou abandonado). */
  currentWeekNumber: number | null;
}

export interface ReconcileInput {
  weeks: PlannedWeek[];
  /** Hoje, YYYY-MM-DD no fuso do usuário. */
  today: string;
  /**
   * Datas YYYY-MM-DD (no fuso do usuário) das sessões **concluídas**. Sessão em
   * andamento não entra — mesma regra da prescrição da #144, e pelo mesmo motivo:
   * a sessão de hoje viraria semana cumprida assim que a primeira série fosse
   * registrada, e o bloco avançaria no meio do treino.
   */
  completedDates: string[];
}

export function reconcileBlock({ weeks, today, completedDates }: ReconcileInput): ReconciledBlock {
  const ordered = [...weeks]
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map<ReconciledWeek>((week) => ({
      ...week,
      effectiveWeekStart: week.weekStart,
      effectiveWeekEnd: addDaysIso(week.weekStart, 6),
      sessionsDone: 0,
      shiftedWeeks: 0,
      state: 'upcoming',
    }));

  let status: BlockStatus = 'active';
  let cursor = 0;

  while (cursor < ordered.length) {
    const week = ordered[cursor];
    week.sessionsDone = countIn(completedDates, week.effectiveWeekStart, week.effectiveWeekEnd);

    // Janela ainda aberta: a semana corrente não é julgada. Sem isto, uma
    // segunda-feira sem treino ainda seria uma semana "perdida" às 9h da manhã.
    if (today <= week.effectiveWeekEnd) {
      week.state = today < week.effectiveWeekStart ? 'upcoming' : 'current';
      break;
    }

    if (week.sessionsDone === 0) {
      week.shiftedWeeks += 1;

      // Bloco que ficou para trás e nunca fecha vira ruído permanente no
      // dashboard. Depois de três semanas seguidas sem nada, quem voltar quer
      // começar de novo, não retomar a semana 1 de um mês atrás.
      if (week.shiftedWeeks >= MAX_MISSED_WEEKS) {
        week.state = 'missed';
        status = 'abandoned';
        break;
      }

      // Empurra ESTA semana e todas as seguintes em 7 dias: quem viajou não
      // perde a semana 2, ele faz a semana 1 na volta. O bloco passa a ocupar 5
      // semanas de calendário e continua sendo 4 semanas de treino.
      for (let i = cursor; i < ordered.length; i++) {
        ordered[i].effectiveWeekStart = addDaysIso(ordered[i].effectiveWeekStart, 7);
        ordered[i].effectiveWeekEnd = addDaysIso(ordered[i].effectiveWeekEnd, 7);
      }
      // Sem `cursor++`: a MESMA semana é reavaliada na janela nova. É isso que
      // faz o empurrão ser um por semana de calendário perdida, e não um por
      // leitura — reancorar a cada chamada faria o bloco fugir para sempre.
      continue;
    }

    // Semana parcial conta como cumprida e NÃO empurra o resto. Empurrar por
    // sessão perdida transforma o plano num relógio impossível de cumprir: basta
    // faltar uma vez para o bloco nunca mais terminar.
    week.state = week.sessionsDone >= week.sessionsTarget ? 'done' : 'partial';
    cursor++;
  }

  if (cursor >= ordered.length) status = 'completed';

  return {
    status,
    weeks: ordered,
    currentWeekNumber: status === 'active' ? (ordered[cursor]?.weekNumber ?? null) : null,
  };
}

/** Comparação de strings YYYY-MM-DD: ordem lexicográfica é a ordem cronológica. */
function countIn(dates: string[], start: string, end: string): number {
  return dates.filter((date) => date >= start && date <= end).length;
}
