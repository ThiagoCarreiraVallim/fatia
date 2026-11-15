/**
 * O dia e a refeição como a tela de Alimentação mostra (#374, pranchas Al-N1 e
 * Al-N8), iguais no PWA e no app: a faixa de cada nutriente, a barra com a
 * faixa marcada, o "De onde veio" e o campo numérico que aceita vírgula.
 */
import { formatDecimal, formatInteger } from './format';
import { shiftDay } from './meal-templates';
import type { DayNutrient, Meal, MealItem, MealType } from './nutrition';

/** Inteiro com milhar a partir de 10; abaixo disso uma casa ("2,5 g"). */
export function formatNutrientAmount(value: number, unit: string): string {
  const abs = Math.abs(value);
  const text =
    abs >= 10 || Number.isInteger(abs)
      ? formatInteger(abs)
      : formatDecimal(abs, 1).replace(/,0$/, '');
  return `${text} ${unit}`;
}

/** "1.800–2.200 kcal", "mín 25 g", "até 2.000 mg" ou "sem meta". */
export function dayNutrientRangeText(n: DayNutrient): string {
  if (n.min != null && n.max != null) {
    return `${formatInteger(n.min)}–${formatInteger(n.max)} ${n.unit}`;
  }
  if (n.min != null) return `mín ${formatNutrientAmount(n.min, n.unit)}`;
  if (n.max != null) return `até ${formatNutrientAmount(n.max, n.unit)}`;
  return 'sem meta';
}

/** O que falta, o que passou ou que está tudo certo. */
export function dayNutrientStatusText(n: DayNutrient): string {
  if (n.status === 'under' && n.min != null) {
    return `faltam ${formatNutrientAmount(n.min - n.value, n.unit)}`;
  }
  if (n.status === 'over' && n.max != null) {
    return `passou ${formatNutrientAmount(n.value - n.max, n.unit)}`;
  }
  if (n.status === 'ok') {
    if (n.min != null && n.max != null) return 'na faixa';
    if (n.min != null) return 'mínimo batido';
    return 'dentro do limite';
  }
  return 'sem meta';
}

export interface DayNutrientBar {
  /** % preenchido, 0–100. */
  fill: number;
  /** Onde começa e termina a faixa, em % da barra; `null` sem esse lado. */
  lo: number | null;
  hi: number | null;
}

const pct = (part: number, whole: number) =>
  Math.round(Math.min(100, Math.max(0, (part / whole) * 100)) * 100) / 100;

/**
 * A barra vai até 20% acima do teto (ou 50% acima do mínimo, sem teto), para o
 * "passou" aparecer como passou e não como barra cheia.
 */
export function dayNutrientBar(n: DayNutrient): DayNutrientBar {
  const scale = n.max != null ? n.max * 1.2 : n.min != null ? n.min * 1.5 : n.value;
  if (!(scale > 0)) return { fill: 0, lo: null, hi: null };
  return {
    fill: pct(n.value, scale),
    lo: n.min != null ? pct(n.min, scale) : null,
    hi: n.max != null ? pct(n.max, scale) : null,
  };
}

const MACRO_FIELDS: Record<string, 'kcal' | 'proteinG' | 'carbsG' | 'fatG'> = {
  kcal: 'kcal',
  protein_g: 'proteinG',
  carbs_g: 'carbsG',
  fat_g: 'fatG',
};

/** Quanto do nutriente veio desta refeição (macro ou micro do item). */
export function mealNutrientValue(meal: Pick<Meal, 'items'>, key: string): number {
  const field = MACRO_FIELDS[key];
  const total = meal.items.reduce(
    (sum, item) => sum + (field ? item[field] : (item.nutrients?.[key] ?? 0)),
    0,
  );
  return Math.round(total * 100) / 100;
}

/** % do dia que a refeição representa, inteiro. */
export function mealShareOfDay(value: number, dayTotal: number): number {
  if (!(dayTotal > 0)) return 0;
  return Math.round((value / dayTotal) * 100);
}

/** "Arroz branco, Frango grelhado". */
export function mealSummary(meal: Pick<Meal, 'items'>): string {
  return meal.items.map((item) => item.foodName).join(', ');
}

/** Pinta o selo "IA": algum item reconhecido pela IA. */
export function mealHasAiItems(meal: Pick<Meal, 'items' | 'origin'>): boolean {
  return meal.origin === 'AI' || meal.items.some((item) => item.source === 'AI');
}

/**
 * Lê o que a pessoa digitou num campo numérico: "1,5" ou "1.5". Vazio, negativo
 * ou incompleto ("12,") volta `null` para a tela dizer o erro.
 */
export function parseDecimalInput(input: string): number | null {
  const text = input.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** As contas do item em `grams`, para a tela de editar mostrar antes de salvar. */
export function scaleMealItem(
  item: Pick<MealItem, 'grams' | 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'nutrients'>,
  grams: number,
): {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sodiumMg: number;
} {
  const factor = item.grams > 0 ? grams / item.grams : 0;
  return {
    kcal: Math.round(item.kcal * factor),
    proteinG: round1(item.proteinG * factor),
    carbsG: round1(item.carbsG * factor),
    fatG: round1(item.fatG * factor),
    fiberG: round1((item.nutrients?.fiber_g ?? 0) * factor),
    sodiumMg: Math.round((item.nutrients?.sodium_mg ?? 0) * factor),
  };
}

/** Os dias que viram chips no "Copiar para": de hoje em diante, sem o dia de origem. */
export function copyTargetDays(date: string, today: string, count = 5): string[] {
  const days: string[] = [];
  for (let offset = 0; days.length < count; offset++) {
    const day = shiftDay(today, offset);
    if (day !== date) days.push(day);
  }
  return days;
}

/**
 * Ponto de extensão do plano alimentar (#376): o cartão "Comi isso"/"Trocar"
 * do lanche do plano. Sem plano a lista vem vazia e a tela não mostra nada;
 * quem preenche é a #376.
 */
export interface PlannedMealSuggestion {
  id: string;
  mealType: MealType;
  title: string;
  /** "15:30", na hora do usuário. */
  time: string | null;
  kcal: number;
  items: Array<{ foodName: string; grams: number }>;
}
