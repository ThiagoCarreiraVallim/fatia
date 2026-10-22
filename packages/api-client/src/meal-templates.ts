import type { CopyDayResult, MealTemplate } from './nutrition';

/** Meio-dia UTC: aritmética de dias sem tropeçar em horário de verão. */
function noonUtc(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/** `yyyy-MM-dd` deslocado em `days` dias. */
export function shiftDay(iso: string, days: number): string {
  const d = noonUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "hoje", "ontem", "amanhã" ou "sex, 09/10": para frases como "Copiar para amanhã". */
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'hoje';
  if (date === shiftDay(today, -1)) return 'ontem';
  if (date === shiftDay(today, 1)) return 'amanhã';
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
    .format(noonUtc(date))
    .replace('.', '');
  const [, month, day] = date.split('-');
  return `${weekday}, ${day}/${month}`;
}

/**
 * Para onde copiar quando a pessoa não escolheu: o dia que ela olha costuma ser o
 * passado ("o mesmo de ontem") e o destino, hoje. Olhando hoje, é planejar amanhã.
 */
export function defaultCopyTarget(date: string, today: string): string {
  return date === today ? shiftDay(today, 1) : today;
}

/** "3 itens · 520 kcal". */
export function templateSummary(template: Pick<MealTemplate, 'items'>): string {
  const count = template.items.length;
  const kcal = Math.round(template.items.reduce((total, item) => total + item.kcal, 0));
  return `${count} ${count === 1 ? 'item' : 'itens'} · ${kcal} kcal`;
}

/** Resultado de copiar dia: o que entrou e o que já estava lá. */
export function copyDayText(
  result: Pick<CopyDayResult, 'skipped'> & { created: unknown[] },
): string {
  const created = result.created.length;
  if (created === 0) return 'Essas refeições já estavam lá';
  const text = created === 1 ? '1 refeição copiada' : `${created} refeições copiadas`;
  if (result.skipped === 0) return text;
  return `${text} · ${result.skipped} ${result.skipped === 1 ? 'já estava lá' : 'já estavam lá'}`;
}
