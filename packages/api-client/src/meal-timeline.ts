import type { Meal, MealType } from './nutrition';

/** Ordem do dia: o lanche da tarde vem antes do jantar. */
export const TIMELINE_MEAL_ORDER: MealType[] = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER'];

export type MealTimelineEntry =
  { kind: 'meal'; meal: Meal } | { kind: 'empty'; mealType: MealType };

/**
 * A timeline de refeições do dia, na ordem do dia: cada tipo mostra as
 * refeições registradas (por horário) ou, se não houver nenhuma, o espaço
 * vazio para registrar. Antes os vazios vinham depois de tudo — com o jantar
 * registrado, o café da manhã aparecia embaixo dele.
 */
export function buildMealTimeline(meals: Meal[]): MealTimelineEntry[] {
  const byTime = [...meals].sort((a, b) => a.eatenAt.localeCompare(b.eatenAt));
  return TIMELINE_MEAL_ORDER.flatMap((mealType): MealTimelineEntry[] => {
    const ofType = byTime.filter((m) => m.mealType === mealType);
    return ofType.length > 0
      ? ofType.map((meal) => ({ kind: 'meal', meal }))
      : [{ kind: 'empty', mealType }];
  });
}

/** Meio-dia UTC: aritmética de dias sem tropeçar em horário de verão. */
function noonUtc(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/** Título da timeline para o dia exibido (`yyyy-MM-dd`), relativo a `today`. */
export function mealTimelineTitle(date: string, today: string): string {
  const days = Math.round((noonUtc(today).getTime() - noonUtc(date).getTime()) / 86_400_000);
  if (days === 0) return 'Refeições de hoje';
  if (days === 1) return 'Refeições de ontem';
  const label = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(noonUtc(date));
  return `Refeições de ${label}`;
}
