import { BadRequestException } from '@nestjs/common';
import { dateInTz, todayInTz } from './date-tz';

/** Formato que água e passos guardam em `date`. A checagem de calendário fica em `isCalendarDay`. */
export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const ISO_DAY_MESSAGE = 'A data deve estar no formato AAAA-MM-DD.';

const FUTURE_DAY_MESSAGE = 'Não dá para registrar num dia que ainda não chegou.';

/** `2026-02-30` passa no formato, mas não existe: o `Date` o empurraria para março. */
export function isCalendarDay(ymd: string): boolean {
  if (!ISO_DAY.test(ymd)) return false;
  const [y, m, d] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  return utc.getUTCFullYear() === y && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === d;
}

/**
 * Dia de um registro de água ou passos. Dia inexistente seria gravado e sumiria
 * de toda leitura por dia; dia futuro inflaria a meta de um dia que ainda nem
 * começou. "Futuro" é no fuso da pessoa, que é onde o padrão "hoje" é calculado.
 */
export function assertLoggableDay(ymd: string, timezone: string): void {
  if (!isCalendarDay(ymd)) throw new BadRequestException(ISO_DAY_MESSAGE);
  if (ymd > todayInTz(timezone)) throw new BadRequestException(FUTURE_DAY_MESSAGE);
}

/**
 * Instante de uma pesagem. Compara o dia local, e não o instante: a pesagem
 * de daqui a uma hora ainda é de hoje e não deve dar erro por relógio adiantado.
 */
export function assertLoggableInstant(instant: Date, timezone: string): void {
  if (Number.isNaN(instant.getTime())) throw new BadRequestException('Data e hora inválidas.');
  if (dateInTz(instant, timezone) > todayInTz(timezone)) {
    throw new BadRequestException(FUTURE_DAY_MESSAGE);
  }
}
