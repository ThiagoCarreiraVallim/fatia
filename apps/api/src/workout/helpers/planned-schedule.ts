import { BadRequestException } from '@nestjs/common';
import { addDaysIso } from '../../progress/helpers/date-tz';

/**
 * A agenda do plano de calendário (#379, Al-T24). Funções puras: o serviço
 * grava as datas que saem daqui no aceite e lê o estado de cada uma na hora.
 *
 * "Feito" e "não feito" não são gravados (ADR 019 e ADR 042): saem das sessões
 * concluídas, e a agenda não registra presença.
 */

export interface CalendarSchedule {
  /** Primeiro dia do plano, YYYY-MM-DD no fuso da pessoa. */
  startDate: string;
  /** Quantas semanas o plano dura, contadas a partir de `startDate`. */
  weeks: number;
  /** Dias da semana ISO (1 = segunda … 7 = domingo). */
  weekdays: readonly number[];
}

export type PlannedState = 'done' | 'missed' | 'today' | 'planned';

/** Dia da semana ISO de um YYYY-MM-DD: 1 = segunda … 7 = domingo. */
export function isoWeekday(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** Último dia do plano: o fim da última semana. */
export function planEndDate(startDate: string, weeks: number): string {
  return addDaysIso(startDate, weeks * 7 - 1);
}

/**
 * Os dias com sessão, em ordem. `from` corta o que vem antes (aceitar uma
 * versão nova refaz a agenda de hoje em diante e não mexe no que passou).
 */
export function scheduleDates(schedule: CalendarSchedule, from?: string): string[] {
  const days = new Set(schedule.weekdays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7));
  const end = planEndDate(schedule.startDate, schedule.weeks);
  const dates: string[] = [];
  for (let day = schedule.startDate; day <= end; day = addDaysIso(day, 1)) {
    if (days.has(isoWeekday(day)) && (!from || day >= from)) dates.push(day);
  }
  return dates;
}

/** O estado de uma sessão da agenda no dia de hoje. */
export function plannedState(date: string, today: string, done: boolean): PlannedState {
  if (done) return 'done';
  if (date === today) return 'today';
  return date > today ? 'planned' : 'missed';
}

/**
 * "Remarcar" (decisão do dono, #379): qualquer dia de hoje até o fim do plano,
 * nunca depois dele. Informativo: não reserva nada.
 */
export function assertRescheduleDate(input: { date: string; today: string; endDate: string }) {
  if (input.date < input.today) {
    throw new BadRequestException('Escolha um dia de hoje em diante.');
  }
  if (input.date > input.endDate) {
    const [, m, d] = input.endDate.split('-');
    throw new BadRequestException(`O plano vai até ${d}/${m}: escolha um dia até lá.`);
  }
}
