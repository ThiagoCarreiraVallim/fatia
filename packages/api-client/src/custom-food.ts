import type { CustomFoodInput, Food } from './nutrition';

/**
 * Formulário de alimento próprio, comum ao PWA e ao app.
 *
 * O rótulo brasileiro traz os valores **por porção** ("porção de 30 g"), e a
 * API guarda **por 100 g**. A conta fica aqui, num lugar só: quem copia o
 * rótulo não deveria ter de fazer regra de três no supermercado.
 */

export type CustomFoodBasis = 'serving' | '100g';

export interface CustomFoodForm {
  name: string;
  basis: CustomFoodBasis;
  servingGrams: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
}

export type CustomFoodErrors = Partial<
  Record<Exclude<keyof CustomFoodForm, 'basis'> | 'macros', string>
>;

export type CustomFoodParse =
  { ok: true; input: CustomFoodInput } | { ok: false; errors: CustomFoodErrors };

/** Nome da medida criada a partir do rótulo; o seletor mostra "1 porção (30 g)". */
export const SERVING_LABEL = 'porção';

/** Os mesmos tetos da API (`food.service.ts`): gordura pura dá 900 kcal em 100 g. */
const MAX_KCAL = 900;
const MAX_MACROS = 100;
const MAX_NAME = 160;
const MAX_SERVING_GRAMS = 2000;

const MACROS = [
  ['protein', 'proteinPer100g'],
  ['carbs', 'carbsPer100g'],
  ['fat', 'fatPer100g'],
] as const;

export function emptyCustomFoodForm(name = ''): CustomFoodForm {
  return { name, basis: 'serving', servingGrams: '', kcal: '', protein: '', carbs: '', fat: '' };
}

/** `''` → null (em branco); texto que não é número ≥ 0 → NaN. */
function parseAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : NaN;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function customFoodFromForm(form: CustomFoodForm): CustomFoodParse {
  const errors: CustomFoodErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Dê um nome ao alimento.';
  else if (name.length > MAX_NAME) errors.name = `Nome muito longo (máx. ${MAX_NAME}).`;

  const byServing = form.basis === 'serving';
  let serving = 100;
  if (byServing) {
    const grams = parseAmount(form.servingGrams);
    if (grams === null || Number.isNaN(grams) || grams <= 0) {
      errors.servingGrams = 'Informe o tamanho da porção em gramas.';
    } else if (grams > MAX_SERVING_GRAMS) {
      errors.servingGrams = 'Porção acima de 2 kg.';
    } else {
      serving = grams;
    }
  }

  const kcal = parseAmount(form.kcal);
  if (kcal === null) errors.kcal = 'Informe as calorias.';
  else if (Number.isNaN(kcal)) errors.kcal = 'Número inválido.';

  const macros: Record<(typeof MACROS)[number][0], number> = { protein: 0, carbs: 0, fat: 0 };
  for (const [field] of MACROS) {
    const value = parseAmount(form[field]);
    if (value !== null && Number.isNaN(value)) errors[field] = 'Número inválido.';
    else macros[field] = value ?? 0;
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  const per100 = (value: number) => round1((value * 100) / serving);
  const input: CustomFoodInput = {
    name,
    kcalPer100g: per100(kcal!),
    proteinPer100g: per100(macros.protein),
    carbsPer100g: per100(macros.carbs),
    fatPer100g: per100(macros.fat),
  };

  // Por porção, o erro quase sempre é a porção errada, não o valor do rótulo.
  const hint = byServing ? ' Confira o valor e a porção.' : '';
  const over = (limit: string) =>
    byServing ? `Dá mais de ${limit} em 100 g.` : `Passa de ${limit} em 100 g.`;

  if (input.kcalPer100g > MAX_KCAL) errors.kcal = over(`${MAX_KCAL} kcal`) + hint;
  for (const [field, key] of MACROS) {
    if (input[key] > MAX_MACROS) errors[field] = over(`${MAX_MACROS} g`) + hint;
  }
  const anyMacroOver = MACROS.some(([field]) => errors[field]);
  if (!anyMacroOver && input.proteinPer100g + input.carbsPer100g + input.fatPer100g > MAX_MACROS) {
    errors.macros = 'Proteína, carboidrato e gordura somam mais que o peso do alimento.';
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  if (byServing) input.portions = [{ label: SERVING_LABEL, grams: serving }];
  return { ok: true, input };
}

type Per100g = Pick<Food, 'kcalPer100g' | 'proteinPer100g' | 'carbsPer100g' | 'fatPer100g'>;

const fmt = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** "450 kcal · P 10 · C 60 · G 18 por 100 g". */
export function customFoodSummary(food: Per100g): string {
  return (
    `${fmt(food.kcalPer100g)} kcal · P ${fmt(food.proteinPer100g)} · ` +
    `C ${fmt(food.carbsPer100g)} · G ${fmt(food.fatPer100g)} por 100 g`
  );
}

const asText = (value: number) => String(value).replace('.', ',');

/** Edição: sempre por 100 g, que é como o alimento está guardado. */
export function customFoodToForm(food: Per100g & Pick<Food, 'name'>): CustomFoodForm {
  return {
    name: food.name,
    basis: '100g',
    servingGrams: '',
    kcal: asText(food.kcalPer100g),
    protein: asText(food.proteinPer100g),
    carbs: asText(food.carbsPer100g),
    fat: asText(food.fatPer100g),
  };
}
