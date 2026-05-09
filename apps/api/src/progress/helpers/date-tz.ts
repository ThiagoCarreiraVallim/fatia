/**
 * Helpers de data no fuso horário do usuário.
 *
 * Por que: passos são logados como string YYYY-MM-DD no fuso do usuário.
 * "Hoje" depende do fuso. Usamos Intl.DateTimeFormat (suporte built-in,
 * sem libs externas) para converter Date → YYYY-MM-DD em qualquer timezone
 * IANA.
 */

export function dateInTz(date: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date);
}

export function todayInTz(timezone: string): string {
  return dateInTz(new Date(), timezone);
}

/**
 * Início da semana (segunda-feira) no fuso do usuário.
 * Retorna YYYY-MM-DD.
 */
export function weekStartInTz(date: Date, timezone: string): string {
  const ymd = dateInTz(date, timezone);
  const [y, m, d] = ymd.split('-').map(Number);
  // Constrói Date pra calcular dia da semana sem deriva de fuso
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = utc.getUTCDay(); // 0=Dom, 1=Seg, ...
  const offset = dow === 0 ? -6 : 1 - dow;
  utc.setUTCDate(utc.getUTCDate() + offset);
  return utc.toISOString().slice(0, 10);
}

/** Soma N dias a uma string YYYY-MM-DD, retornando YYYY-MM-DD. */
export function addDaysIso(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

/** Lista YYYY-MM-DD dos últimos N dias incluindo hoje. */
export function lastNDates(days: number, timezone: string): string[] {
  const today = todayInTz(timezone);
  const list: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    list.push(addDaysIso(today, -i));
  }
  return list;
}
