import type { Food, MealType } from './nutrition';

/**
 * Regras de tela do "Adicionar comida" (#375), comuns ao PWA e ao app: a busca
 * (Al-N15), a quantidade (Al-N3) e Meus alimentos (Al-N12). Os números que
 * mudam ao vivo saem daqui para as duas pontas darem o mesmo valor.
 */

/** A busca começa com 2 letras; antes disso a tela mostra os atalhos. */
export function isSearching(q: string): boolean {
  return q.trim().length >= 2;
}

export interface OriginTag {
  label: string;
  /** `ok` pinta como "seu"; `mute` é o catálogo. */
  tone: 'ok' | 'mute';
}

/**
 * O selo de origem de cada resultado. Só o que é guardado: TACO ou "seu". O
 * produto lido no Open Food Facts não é guardado (ADR 017) e por isso não
 * aparece na busca; o que a pessoa salvou dele é "seu".
 */
export function foodOriginTag(food: Pick<Food, 'source'>): OriginTag {
  if (food.source === 'CUSTOM') return { label: 'seu', tone: 'ok' };
  return { label: food.source, tone: 'mute' };
}

export function resultsCaption(count: number): string {
  return `${count} ${count === 1 ? 'resultado' : 'resultados'} · TACO e seus alimentos`;
}

export function emptySearchCopy(q: string): { title: string; action: string } {
  const term = q.trim();
  return { title: `Nada com “${term}”`, action: `Criar “${term}” como meu alimento` };
}

const MEAL_TARGET: Record<MealType, string> = {
  BREAKFAST: 'ao café',
  LUNCH: 'ao almoço',
  SNACK: 'ao lanche',
  DINNER: 'ao jantar',
};

/** "Adicionar ao jantar": o botão diz para onde vai. */
export function addTargetLabel(mealType: MealType | undefined): string {
  return mealType ? `Adicionar ${MEAL_TARGET[mealType]}` : 'Adicionar';
}

export interface AmountPreview {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** `null` quando o alimento não tem o dado: a tela mostra "—", não zero. */
  fiberG: number | null;
  sodiumMg: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

type Per100 = Pick<Food, 'kcalPer100g' | 'proteinPer100g' | 'carbsPer100g' | 'fatPer100g'> & {
  nutrients?: Record<string, number> | null;
};

/** O que `grams` do alimento dá, ao vivo no Al-N3. */
export function foodAmountPreview(food: Per100, grams: number | null): AmountPreview | null {
  if (grams === null || !Number.isFinite(grams) || grams <= 0) return null;
  const ratio = grams / 100;
  const micro = (key: string) => {
    const value = food.nutrients?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value * ratio : null;
  };
  const fiber = micro('fiber_g');
  const sodium = micro('sodium_mg');
  return {
    kcal: Math.round(food.kcalPer100g * ratio),
    proteinG: round1(food.proteinPer100g * ratio),
    carbsG: round1(food.carbsPer100g * ratio),
    fatG: round1(food.fatPer100g * ratio),
    fiberG: fiber === null ? null : round1(fiber),
    sodiumMg: sodium === null ? null : Math.round(sodium),
  };
}

export type MyFoodsTab = 'all' | 'foods' | 'meals';

/**
 * As abas do Al-N12. Sem "Lidos": o produto lido pelo código não é guardado
 * (ADR 017); o que a pessoa salvou dele já é um alimento seu.
 */
export function myFoodsTabs(): Array<{ key: MyFoodsTab; label: string }> {
  return [
    { key: 'all', label: 'Todos' },
    { key: 'foods', label: 'Alimentos' },
    { key: 'meals', label: 'Refeições' },
  ];
}

/** Texto do Al-N12 que explica o que cabe ali. */
export const MY_FOODS_HINT =
  'O que não está na busca: produto embalado, receita de casa, o pão da padaria.';
