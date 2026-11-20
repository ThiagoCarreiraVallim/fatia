/**
 * Dia útil no Brasil (#400): segunda a sexta, fora os feriados nacionais. É
 * quando sai o e-mail mensal do relatório. Função pura e sem fuso: recebe e
 * devolve datas `YYYY-MM-DD` que já estão no fuso da comunidade.
 *
 * Só feriado nacional (Lei 662/1949, 6.802/1980 e 14.759/2023, mais a
 * Sexta-feira Santa). Feriado estadual e municipal e ponto facultativo
 * (Carnaval, Corpus Christi) não entram: o relatório chega num dia em que a
 * academia pode estar fechada, e isso não atrasa nada.
 */

const FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), em UTC. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

export function brazilNationalHolidays(year: number): Set<string> {
  const out = new Set(FIXOS.map((md) => `${year}-${md}`));
  const sextaSanta = new Date(easterSunday(year).getTime() - 2 * 86_400_000);
  out.add(ymd(sextaSanta));
  return out;
}

export function isBusinessDay(date: string): boolean {
  const d = new Date(`${date}T12:00:00Z`);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !brazilNationalHolidays(d.getUTCFullYear()).has(date);
}

/** O `n`-ésimo dia útil do mês `YYYY-MM` (o 1º por padrão). */
export function businessDayOf(month: string, n = 1): string {
  const d = new Date(`${month}-01T12:00:00Z`);
  let achados = 0;
  for (;;) {
    if (isBusinessDay(ymd(d)) && ++achados === n) return ymd(d);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

/** O 1º dia útil do mês `YYYY-MM`. */
export function firstBusinessDay(month: string): string {
  return businessDayOf(month, 1);
}
