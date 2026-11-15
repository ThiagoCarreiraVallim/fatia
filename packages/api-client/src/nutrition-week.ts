/**
 * A faixa de dias da Nutrição (prancha Al-N1): a semana, de segunda a domingo,
 * do dia escolhido, com o dia que teve refeição contornado. E o texto da
 * refeição ainda vazia do "De onde veio" ("20:00 · Jantar · cabem até…").
 * Igual no PWA e no app.
 */
import { formatInteger } from './format';
import { formatNutrientAmount } from './meal-day';
import { shiftDay } from './meal-templates';
import type { DayNutrient, MealType } from './nutrition';

export interface NutritionWeekDay {
  /** `yyyy-MM-dd`. */
  iso: string;
  /** Letra do dia (S, T, Q…). */
  weekday: string;
  /** Dia do mês. */
  day: number;
  /** Nome para o leitor de tela ("segunda, 9 de novembro"). */
  label: string;
  /** Teve refeição registrada. */
  done: boolean;
}

const LETTER = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const NAME = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTH = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const DAY_MS = 86_400_000;

function noonUtc(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/** Segunda-feira da semana do dia. */
function monday(iso: string): string {
  const dow = noonUtc(iso).getUTCDay();
  return shiftDay(iso, -((dow + 6) % 7));
}

/** Os sete dias da semana de `date`; `history` vem de `nutritionApi.history`. */
export function nutritionWeek(
  date: string,
  history: ReadonlyArray<{ date: string; meals: number }>,
): NutritionWeekDay[] {
  const logged = new Set(history.filter((h) => h.meals > 0).map((h) => h.date));
  const start = monday(date);
  return Array.from({ length: 7 }, (_, i) => {
    const iso = shiftDay(start, i);
    const d = noonUtc(iso);
    return {
      iso,
      weekday: LETTER[d.getUTCDay()]!,
      day: d.getUTCDate(),
      label: `${NAME[d.getUTCDay()]}, ${d.getUTCDate()} de ${MONTH[d.getUTCMonth()]}`,
      done: logged.has(iso),
    };
  });
}

/** Quantos dias pedir ao histórico para cobrir a semana até hoje (1 a 90, como a API). */
export function historyDaysForWeek(date: string, today: string): number {
  const days =
    Math.round((noonUtc(today).getTime() - noonUtc(monday(date)).getTime()) / DAY_MS) + 1;
  return Math.max(1, Math.min(90, days));
}

/** O mesmo dia da semana, `weeks` semanas depois (negativo: antes). */
export function shiftWeek(date: string, weeks: number): string {
  return shiftDay(date, weeks * 7);
}

/** Horário de costume de cada refeição, na coluna da esquerda do vazio. */
export const MEAL_TYPICAL_TIME: Record<MealType, string> = {
  BREAKFAST: '07:00',
  LUNCH: '12:00',
  SNACK: '16:00',
  DINNER: '20:00',
};

/** A linha de baixo da refeição vazia: quanto ainda cabe do nutriente do dia. */
export function emptyMealHint(n: DayNutrient): string {
  if (n.max == null) return 'Toque para registrar';
  if (n.value >= n.max) return 'acima do máximo de hoje';
  const left = n.max - n.value;
  return `cabem até ${n.unit === 'kcal' ? `${formatInteger(left)} kcal` : formatNutrientAmount(left, n.unit)}`;
}
