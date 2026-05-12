/**
 * Helpers de data com suporte a fuso horário do usuário.
 *
 * Para simplicidade na v1, usamos formatação via Intl.DateTimeFormat sem
 * bibliotecas externas. A precisão é suficiente para datas de 24h.
 */

/**
 * Retorna string YYYY-MM-DD no fuso do usuário para o instante `date`.
 * Se timezone for inválido, cai de volta para UTC.
 */
export function dateInTz(date: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')!.value;
    const m = parts.find((p) => p.type === 'month')!.value;
    const d = parts.find((p) => p.type === 'day')!.value;
    return `${y}-${m}-${d}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Retorna a data do início da semana (segunda-feira) no fuso do usuário
 * para o instante `date`.
 */
export function startOfWeekInTz(date: Date, timezone: string): string {
  const todayStr = dateInTz(date, timezone);
  const today = new Date(`${todayStr}T00:00:00Z`);
  // getUTCDay(): 0=Sun,1=Mon,...,6=Sat. Segunda=1; offset para Monday.
  const dow = today.getUTCDay();
  const daysToMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(today);
  monday.setUTCDate(monday.getUTCDate() - daysToMonday);
  return monday.toISOString().slice(0, 10);
}

/**
 * Adiciona `n` dias a uma data no formato YYYY-MM-DD e retorna nova string.
 */
export function addDaysToDateStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Retorna o instante UTC do início do dia YYYY-MM-DD (00:00:00 UTC). */
export function dayStartUTC(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** Retorna o instante UTC imediatamente após o fim do dia (início do próximo dia). */
export function dayEndUTC(dateStr: string): Date {
  return new Date(`${addDaysToDateStr(dateStr, 1)}T00:00:00.000Z`);
}

/** Gera array de strings YYYY-MM-DD dos últimos `days` dias (hoje inclusive). */
export function lastNDates(days: number, timezone: string): string[] {
  const today = dateInTz(new Date(), timezone);
  return Array.from({ length: days }, (_, i) => addDaysToDateStr(today, -(days - 1 - i)));
}
