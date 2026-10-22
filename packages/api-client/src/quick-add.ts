import type { MealType } from './nutrition';

/**
 * O "+" global: registrar a partir de qualquer tela. Web e mobile montam o
 * mesmo menu, na mesma ordem e com os mesmos textos, a partir daqui.
 */

export type QuickAddKey = 'meal' | 'water' | 'weight' | 'steps' | 'workout';

export const QUICK_ADD_ITEMS: { key: QuickAddKey; label: string }[] = [
  { key: 'meal', label: 'Refeição' },
  { key: 'water', label: 'Água' },
  { key: 'weight', label: 'Peso' },
  { key: 'steps', label: 'Passos' },
  { key: 'workout', label: 'Treino' },
];

/**
 * A refeição que o "+" sugere pela hora local. É só o ponto de partida: quem
 * quer outra registra pela Nutrição, tocando no tipo. Madrugada vira lanche —
 * ninguém toma café da manhã às 3h, e jantar às 3h é do dia anterior.
 */
export function mealTypeForTime(now: Date): MealType {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < 5 * 60) return 'SNACK';
  if (minutes < 10 * 60 + 30) return 'BREAKFAST';
  if (minutes < 15 * 60) return 'LUNCH';
  if (minutes < 18 * 60) return 'SNACK';
  return 'DINNER';
}

/**
 * O treino do "+" retoma a sessão aberta em vez de começar outra: a API cria
 * uma sessão nova a cada chamada, e duas abertas confundem o histórico.
 */
export function workoutQuickLabel(hasActiveSession: boolean): string {
  return hasActiveSession ? 'Continuar treino' : 'Começar treino livre';
}
