import { dateInTz } from '../../progress/helpers/date-tz';

/**
 * Baldes de tempo dos recortes, sempre no fuso de **quem treinou**.
 *
 * Não é detalhe: uma sessão às 23h em São Paulo é 02h do dia seguinte em UTC.
 * Agrupar pelo relógio do servidor moveria a sessão de dia, de semana e de faixa
 * — e produziria "pico da academia às 2 da manhã" com todos os testes verdes,
 * desde que o teste também usasse UTC.
 *
 * `dateInTz` e `weekStartInTz` já existem em `progress/helpers/date-tz.ts` e são
 * reusados aqui. O que falta lá é a **hora** no fuso, que só este módulo precisa.
 */

/** Faixas do dia. Fechadas e nomeadas — não são um filtro que o dono compõe. */
export const HOUR_BANDS = ['madrugada', 'manhã', 'tarde', 'noite'] as const;

export type HourBand = (typeof HOUR_BANDS)[number];

/** Hora local (0-23) no fuso informado. */
export function hourInTz(date: Date, timezone: string): number {
  const hora = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  }).format(date);
  // `en-GB` devolve "24" para meia-noite em algumas versões de ICU.
  return Number(hora) % 24;
}

/** Faixa do dia da sessão, no fuso de quem treinou. */
export function hourBandInTz(date: Date, timezone: string): HourBand {
  const hora = hourInTz(date, timezone);
  if (hora < 6) return 'madrugada';
  if (hora < 12) return 'manhã';
  if (hora < 18) return 'tarde';
  return 'noite';
}

/** Mês `YYYY-MM` no fuso informado. */
export function monthInTz(date: Date, timezone: string): string {
  return dateInTz(date, timezone).slice(0, 7);
}

/** Dias inteiros entre dois instantes, nunca negativo. */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}
