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
/** Folga das faixas que o plano grava a partir das metas em número. */
export const KCAL_RANGE = 0.05;
export const MACRO_RANGE = 0.1;

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
  switch (key) {
    case 'carbs':
      return food.carbsPer100g;
    case 'protein':
      return food.proteinPer100g;
    case 'fat':
      return food.fatPer100g;
    case 'kcal':
      return food.kcalPer100g;
  }
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
  const alvo = keyAmount(food, exactGrams, key);
  let melhor: { amount: Amount; desvio: number } | null = null;
  for (const p of portions) {
    if (!(p.grams > 0)) continue;
    const bruto = exactGrams / p.grams;
    for (const q of [Math.floor(bruto / PORTION_STEP), Math.ceil(bruto / PORTION_STEP)]) {
      const quantity = q * PORTION_STEP;
      if (quantity < PORTION_STEP || quantity > MAX_PORTION_QUANTITY) continue;
      const grams = Math.round(p.grams * quantity * 10) / 10;
      const desvio = alvo > 0 ? Math.abs(keyAmount(food, grams, key) - alvo) / alvo : 0;
      // Folga de arredondamento: 10,0% em ponto flutuante ainda é 10%.
      if (desvio > EQUIVALENT_TOLERANCE + 1e-9) continue;
      if (!melhor || desvio < melhor.desvio) {
        melhor = { amount: { grams, portionLabel: p.label, portionQuantity: quantity }, desvio };
      }
    }
  }
  if (melhor) return melhor.amount;
  return {
    grams: Math.max(GRAMS_STEP, Math.round(exactGrams / GRAMS_STEP) * GRAMS_STEP),
    portionLabel: null,
    portionQuantity: null,
  };
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
  const por100 = keyPer100(food, key);
  if (!(por100 > 0) || !(target > 0)) return null;
  return roundToHousehold(food, (target * 100) / por100, portions, key);
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
  return roundToHousehold(food, amount.grams * factor, portions, 'kcal');
}

/**
 * As metas do editor são um número por macro; o plano guarda faixas, como as
 * metas do dia: kcal ±5% (a mesma folga da sugestão de metas) e macros ±10%.
 */
export function targetsToRanges(t: Targets): GoalRanges {
  const faixa = (v: number, folga: number) => [
    Math.round(v * (1 - folga)),
    Math.round(v * (1 + folga)),
  ];
  const [kcalMin, kcalMax] = faixa(t.kcal, KCAL_RANGE);
  const [proteinMinG, proteinMaxG] = faixa(t.proteinG, MACRO_RANGE);
  const [carbsMinG, carbsMaxG] = faixa(t.carbsG, MACRO_RANGE);
  const [fatMinG, fatMaxG] = faixa(t.fatG, MACRO_RANGE);
  return {
    kcalMin: kcalMin!,
    kcalMax: kcalMax!,
    proteinMinG: proteinMinG!,
    proteinMaxG: proteinMaxG!,
    carbsMinG: carbsMinG!,
    carbsMaxG: carbsMaxG!,
    fatMinG: fatMinG!,
    fatMaxG: fatMaxG!,
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
