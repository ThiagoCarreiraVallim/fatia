/**
 * Grupos de equivalentes do plano alimentar (#407, Pn-24): "100 g de arroz =
 * 130 g de batata-doce = 2 fatias de pão integral". Cada alimento do grupo
 * entra na quantidade que dá a mesma quantidade do macro-chave (carboidrato,
 * proteína, gordura ou kcal) do item que ele substitui, com tolerância de ±10%
 * para caber numa medida caseira.
 *
 * Contas puras, sem banco: o envio e a cópia do aluno chamam com os alimentos
 * (por 100 g) e as medidas caseiras do catálogo já buscados.
 */

export const KEY_MACROS = ['carbs', 'protein', 'fat', 'kcal'] as const;
export type KeyMacro = (typeof KEY_MACROS)[number];

/** ±10%: o quanto a medida caseira pode se afastar da quantidade exata. */
export const EQUIVALENT_TOLERANCE = 0.1;

/** Passo da quantidade em medida caseira ("1½ fatia"). */
const PORTION_STEP = 0.5;
/** Sem medida que caiba, as gramas vão de 5 em 5. */
const GRAMS_STEP = 5;
const MAX_PORTION_QUANTITY = 20;

export interface Per100 {
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

export interface PortionRef {
  label: string;
  grams: number;
}

export interface Amount {
  grams: number;
  portionLabel: string | null;
  portionQuantity: number | null;
}

export interface Targets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface GoalRanges {
  kcalMin: number;
  kcalMax: number;
  proteinMinG: number;
  proteinMaxG: number;
  carbsMinG: number;
  carbsMaxG: number;
  fatMinG: number;
  fatMaxG: number;
}

/** Quanto do macro-chave há em 100 g do alimento. */
export function keyPer100(food: Per100, key: KeyMacro): number {
  void food;
  void key;
  return 0;
}

/** Quanto do macro-chave há nesta quantidade. */
export function keyAmount(food: Per100, grams: number, key: KeyMacro): number {
  return (keyPer100(food, key) * grams) / 100;
}

/**
 * Leva gramas exatas para uma medida caseira do catálogo quando alguma, em
 * meios, fica a até ±10% do macro-chave das gramas exatas; a mais próxima
 * vence. Sem medida que caiba, arredonda a 5 g.
 */
export function roundToHousehold(
  food: Per100,
  exactGrams: number,
  portions: PortionRef[],
  key: KeyMacro,
): Amount {
  void food;
  void portions;
  void key;
  return { grams: exactGrams, portionLabel: null, portionQuantity: null };
}

/**
 * A quantidade do alimento que dá `target` do macro-chave, em medida caseira
 * quando cabe. Nulo se o alimento não tem o macro-chave (não serve de troca).
 */
export function equivalentAmount(
  food: Per100,
  target: number,
  portions: PortionRef[],
  key: KeyMacro,
): Amount | null {
  void food;
  void target;
  void portions;
  void key;
  return null;
}

/**
 * "Ajustar às metas de cada aluno": a quantidade vezes o fator das calorias,
 * arredondada de novo à medida caseira (pela kcal).
 */
export function scaleAmount(
  food: Per100,
  amount: Amount,
  factor: number,
  portions: PortionRef[],
): Amount {
  void food;
  void factor;
  void portions;
  return amount;
}

/**
 * As metas do editor são um número por macro; o plano guarda faixas, como as
 * metas do dia: kcal ±5% (a mesma folga da sugestão de metas) e macros ±10%.
 */
export function targetsToRanges(t: Targets): GoalRanges {
  return {
    kcalMin: t.kcal,
    kcalMax: t.kcal,
    proteinMinG: t.proteinG,
    proteinMaxG: t.proteinG,
    carbsMinG: t.carbsG,
    carbsMaxG: t.carbsG,
    fatMinG: t.fatG,
    fatMaxG: t.fatG,
  };
}

/** O contrário, para reabrir no editor um plano que só tem faixas: o meio de cada uma. */
export function rangesToTargets(g: GoalRanges): Targets {
  return {
    kcal: Math.round((g.kcalMin + g.kcalMax) / 2),
    proteinG: Math.round((g.proteinMinG + g.proteinMaxG) / 2),
    carbsG: Math.round((g.carbsMinG + g.carbsMaxG) / 2),
    fatG: Math.round((g.fatMinG + g.fatMaxG) / 2),
  };
}

export { PORTION_STEP, GRAMS_STEP, MAX_PORTION_QUANTITY };
