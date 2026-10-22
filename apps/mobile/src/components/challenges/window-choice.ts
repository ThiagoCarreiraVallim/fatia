import { addDaysToIso } from '@fatia/api-client';

/** Começo do desafio no app: datas prontas em vez de calendário (as livres ficam na web). */
export type StartChoice = 'today' | 'tomorrow' | 'monday';
export type DurationChoice = '7' | '14' | '30';

/** A próxima segunda-feira depois de hoje (hoje sendo segunda, a da semana que vem). */
export function nextMonday(today: string): string {
  const dia = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addDaysToIso(today, (8 - dia) % 7 || 7);
}

/** As datas, inclusivas, que vão para a API. */
export function challengeWindow(
  today: string,
  start: StartChoice,
  duration: DurationChoice,
): { startDate: string; endDate: string } {
  const startDate =
    start === 'today' ? today : start === 'tomorrow' ? addDaysToIso(today, 1) : nextMonday(today);
  return { startDate, endDate: addDaysToIso(startDate, Number(duration) - 1) };
}
