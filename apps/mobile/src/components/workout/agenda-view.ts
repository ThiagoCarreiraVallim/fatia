import {
  addDays,
  agendaDayLabel,
  agendaRangeLabel,
  agendaWeek,
  monthGrid,
  rescheduleDays,
  type AgendaItem,
  type AgendaState,
} from '@fatia/api-client';

/**
 * Contas da agenda no app (#379, prancha Al-T24) que não dependem de tela: o
 * intervalo da semana ou do mês, o ponto de cada dia e os dias do "Remarcar".
 */

export type AgendaMode = 'week' | 'month';

/** YYYY-MM-DD de agora no fuso dado (o do aparelho, sem fuso explícito). */
export function localToday(now: Date = new Date(), timezone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function agendaWindow(
  mode: AgendaMode,
  anchor: string,
): { from: string; to: string; label: string } {
  if (mode === 'month') return monthGrid(anchor);
  const { from, to } = agendaWeek(anchor);
  return { from, to, label: agendaRangeLabel(from, to) };
}

/** Semana: sete dias. Mês: o dia 1 do mês vizinho. */
export function shiftAnchor(mode: AgendaMode, anchor: string, dir: 1 | -1): string {
  if (mode === 'week') return addDays(anchor, 7 * dir);
  const y = Number(anchor.slice(0, 4));
  const m = Number(anchor.slice(5, 7)) - 1 + dir;
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

/** O ponto embaixo do dia: o que mais pede atenção vence. */
export function dayDot(items: AgendaItem[]): AgendaState | null {
  if (items.length === 0) return null;
  const states = new Set(items.map((i) => i.state));
  if (states.has('missed')) return 'missed';
  if (states.has('today')) return 'today';
  if (states.has('planned')) return 'planned';
  return 'done';
}

/** O dia aberto ao chegar: hoje, se estiver no intervalo; senão o primeiro com sessão. */
export function defaultSelectedDay(a: {
  today: string;
  days: Array<{ date: string; items: AgendaItem[] }>;
}): string {
  if (a.days.some((d) => d.date === a.today)) return a.today;
  return a.days.find((d) => d.items.length > 0)?.date ?? a.days[0]?.date ?? a.today;
}

/** Os dias do "Remarcar": de hoje ao fim do plano, menos o dia em que a sessão já está. */
export function rescheduleChoices(
  today: string,
  endDate: string | null,
  current: string,
): Array<{ date: string; label: string; today: boolean }> {
  if (!endDate) return [];
  return rescheduleDays(today, endDate)
    .filter((d) => d !== current)
    .map((date) => ({ date, label: agendaDayLabel(date).long, today: date === today }));
}
