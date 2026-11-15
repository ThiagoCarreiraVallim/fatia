import { parseDecimalInput } from './meal-day';
import type { CustomFoodInput, CustomFoodPatch, Food, LabelReading } from './nutrition';
import { NUTRIENT_PRESETS } from './nutrition-plan';

/**
 * Formulário de alimento próprio, comum ao PWA e ao app (Al-N11).
 *
 * O rótulo brasileiro traz os valores **por porção** ("porção de 30 g"), e a
 * API guarda **por 100 g**. A conta fica aqui, num lugar só: quem copia o
 * rótulo não deveria ter de fazer regra de três no supermercado. Os
 * micronutrientes (#375) passam pela mesma conta, na mesma base dos macros.
 */

export type CustomFoodBasis = 'serving' | '100g';

export interface CustomFoodForm {
  name: string;
  basis: CustomFoodBasis;
  /** Por porção: obrigatória. Por 100 g: opcional, vira a medida "porção". */
  servingGrams: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  /** Micronutrientes digitados, na base de `basis`: `{ fiber_g: "3,6" }`. */
  nutrients?: Record<string, string>;
  /** "Vincular a um código de barras" (#375): vazio = sem código. */
  barcode?: string;
}

type FieldKey = 'name' | 'servingGrams' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'barcode';

export type CustomFoodErrors = Partial<Record<FieldKey | 'macros', string>> & {
  /** Erro por micronutriente, pela chave. */
  nutrients?: Record<string, string>;
};

export type CustomFoodParse =
  { ok: true; input: CustomFoodInput } | { ok: false; errors: CustomFoodErrors };

/** Nome da medida criada a partir do rótulo; o seletor mostra "1 porção (30 g)". */
export const SERVING_LABEL = 'porção';

/** Os mesmos tetos da API (`food.service.ts`): gordura pura dá 900 kcal em 100 g. */
const MAX_KCAL = 900;
const MAX_MACROS = 100;
const MAX_NAME = 160;
const MAX_SERVING_GRAMS = 2000;
/** Teto da API para nutriente que não é em gramas (mg, mcg…), por 100 g. */
const MAX_NUTRIENT_OTHER = 1_000_000;
const BARCODE = /^\d{8,14}$/;
const NOT_A_NUMBER = 'Número inválido.';

const MACROS = [
  ['protein', 'proteinPer100g'],
  ['carbs', 'carbsPer100g'],
  ['fat', 'fatPer100g'],
] as const;

export function emptyCustomFoodForm(name = ''): CustomFoodForm {
  return {
    name,
    basis: 'serving',
    servingGrams: '',
    kcal: '',
    protein: '',
    carbs: '',
    fat: '',
    nutrients: {},
    barcode: '',
  };
}

/**
 * `''` → null (em branco); texto que não é número ≥ 0 → NaN. Aceita "1,5" e
 * "1.500" (milhar), como `parseDecimalInput` das outras telas.
 */
function parseAmount(text: string): number | null {
  if (!text.trim()) return null;
  return parseDecimalInput(text) ?? NaN;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

export function customFoodFromForm(form: CustomFoodForm): CustomFoodParse {
  const errors: CustomFoodErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Dê um nome ao alimento.';
  else if (name.length > MAX_NAME) errors.name = `Nome muito longo (máx. ${MAX_NAME}).`;

  const byServing = form.basis === 'serving';
  // A porção é a base da conta "por porção". Por 100 g ela só vira a medida.
  let serving = 100;
  let portionGrams: number | null = null;
  const grams = parseAmount(form.servingGrams);
  if (byServing || grams !== null) {
    if (grams === null || Number.isNaN(grams) || grams <= 0) {
      errors.servingGrams = 'Informe o tamanho da porção em gramas.';
    } else if (grams > MAX_SERVING_GRAMS) {
      errors.servingGrams = 'Porção acima de 2 kg.';
    } else {
      portionGrams = grams;
      if (byServing) serving = grams;
    }
  }

  const kcal = parseAmount(form.kcal);
  if (kcal === null) errors.kcal = 'Informe as calorias.';
  else if (Number.isNaN(kcal)) errors.kcal = NOT_A_NUMBER;

  const macros: Record<(typeof MACROS)[number][0], number> = { protein: 0, carbs: 0, fat: 0 };
  for (const [field] of MACROS) {
    const value = parseAmount(form[field]);
    if (value !== null && Number.isNaN(value)) errors[field] = NOT_A_NUMBER;
    else macros[field] = value ?? 0;
  }

  // Micronutriente em branco não entra: "não sei" não é "zero" (ADR 009).
  const nutrientValues: Record<string, number> = {};
  const nutrientErrors: Record<string, string> = {};
  for (const [key, text] of Object.entries(form.nutrients ?? {})) {
    if (!NUTRIENT_KEY.test(key)) continue;
    const value = parseAmount(text);
    if (value === null) continue;
    if (Number.isNaN(value)) nutrientErrors[key] = NOT_A_NUMBER;
    else nutrientValues[key] = value;
  }

  const barcode = (form.barcode ?? '').trim();
  if (barcode && !BARCODE.test(barcode)) errors.barcode = 'O código tem de 8 a 14 números.';

  if (Object.keys(nutrientErrors).length) errors.nutrients = nutrientErrors;
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

  const nutrients: Record<string, number> = {};
  for (const [key, value] of Object.entries(nutrientValues)) {
    const converted = round2((value * 100) / serving);
    const max = key.endsWith('_g') ? MAX_MACROS : MAX_NUTRIENT_OTHER;
    if (converted > max) {
      nutrientErrors[key] =
        (key.endsWith('_g') ? over(`${MAX_MACROS} g`) : 'Valor alto demais.') + hint;
    } else nutrients[key] = converted;
  }
  if (Object.keys(nutrientErrors).length) errors.nutrients = nutrientErrors;
  if (Object.keys(errors).length) return { ok: false, errors };

  if (Object.keys(nutrients).length) input.nutrients = nutrients;
  if (barcode) input.barcode = barcode;
  if (portionGrams !== null) input.portions = [{ label: SERVING_LABEL, grams: portionGrams }];
  return { ok: true, input };
}

/**
 * O PATCH da edição: o formulário é a verdade inteira, então o que ficou em
 * branco **apaga** (`null`) em vez de ficar como estava. Medidas têm rota própria.
 */
export function customFoodPatch(input: CustomFoodInput): CustomFoodPatch {
  return {
    name: input.name,
    kcalPer100g: input.kcalPer100g,
    proteinPer100g: input.proteinPer100g,
    carbsPer100g: input.carbsPer100g,
    fatPer100g: input.fatPer100g,
    nutrients: input.nutrients ?? null,
    barcode: input.barcode ?? null,
  };
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
export function customFoodToForm(
  food: Per100g & Pick<Food, 'name'> & Partial<Pick<Food, 'nutrients' | 'barcode'>>,
): CustomFoodForm {
  const nutrients: Record<string, string> = {};
  for (const [key, value] of Object.entries(food.nutrients ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) nutrients[key] = asText(value);
  }
  return {
    name: food.name,
    basis: '100g',
    servingGrams: '',
    kcal: asText(food.kcalPer100g),
    protein: asText(food.proteinPer100g),
    carbs: asText(food.carbsPer100g),
    fat: asText(food.fatPer100g),
    nutrients,
    barcode: food.barcode ?? '',
  };
}

/**
 * O rótulo lido pela IA (#375) como formulário para conferir. O que não foi
 * lido fica **em branco**, nunca "0": o zero pré-preenchido é aceito sem ler.
 */
export function customFoodFormFromLabel(reading: LabelReading, barcode = ''): CustomFoodForm {
  const text = (value: number | null) => (value === null ? '' : asText(value));
  const nutrients: Record<string, string> = {};
  if (reading.fiberG !== null) nutrients.fiber_g = text(reading.fiberG);
  if (reading.sodiumMg !== null) nutrients.sodium_mg = text(reading.sodiumMg);
  return {
    name: reading.name ?? '',
    basis: reading.basis,
    servingGrams: text(reading.servingGrams),
    kcal: text(reading.kcal),
    protein: text(reading.proteinG),
    carbs: text(reading.carbsG),
    fat: text(reading.fatG),
    nutrients,
    barcode,
  };
}

/** Um campo de micronutriente do formulário. `mine` = é meta da pessoa (#376). */
export interface MicronutrientField {
  key: string;
  label: string;
  unit: string;
  mine: boolean;
}

/** Os que todo rótulo traz, abertos por padrão depois dos da pessoa. */
const LABEL_DEFAULTS = ['fiber_g', 'sodium_mg', 'sugar_g', 'saturated_fat_g'];

/** "omega_3_g" → rótulo e unidade, quando o nutriente não está nos presets. */
function fieldFromKey(key: string): MicronutrientField {
  const preset = NUTRIENT_PRESETS.find((p) => p.nutrientKey === key);
  if (preset) return { key, label: preset.label, unit: preset.unit, mine: false };
  const match = /^(.*)_(g|mg|mcg|ml)$/.exec(key);
  const unit = match ? (match[2] === 'mcg' ? 'µg' : match[2]!) : '';
  const base = (match ? match[1]! : key).replace(/_/g, ' ');
  return { key, label: base.charAt(0).toUpperCase() + base.slice(1), unit, mine: false };
}

/**
 * Os campos de micronutriente do Al-N11: **os nutrientes personalizados da
 * pessoa primeiro** (as metas da #376), depois os do rótulo, depois o que já
 * estiver preenchido (edição de um alimento com cálcio, por exemplo). Sem repetir.
 */
/** O formato que a API aceita em `Food.nutrients`. Metas antigas podem não seguir. */
const NUTRIENT_KEY = /^[a-z0-9_]{1,40}$/;

export function micronutrientFields(
  targets: ReadonlyArray<{ nutrientKey: string; label: string; unit: string }>,
  filled: Readonly<Record<string, string>>,
): MicronutrientField[] {
  const fields: MicronutrientField[] = [];
  const seen = new Set<string>();
  const push = (field: MicronutrientField) => {
    // Chave fora do formato (meta gravada antes da normalização) faria o salvar dar 400.
    if (seen.has(field.key) || !NUTRIENT_KEY.test(field.key)) return;
    seen.add(field.key);
    fields.push(field);
  };
  for (const t of targets) push({ key: t.nutrientKey, label: t.label, unit: t.unit, mine: true });
  for (const key of LABEL_DEFAULTS) push(fieldFromKey(key));
  for (const key of Object.keys(filled)) push(fieldFromKey(key));
  return fields;
}

/** "Adicionar outro do rótulo": os presets que ainda não estão na lista. */
export function moreMicronutrients(fields: readonly MicronutrientField[]): MicronutrientField[] {
  const shown = new Set(fields.map((f) => f.key));
  return NUTRIENT_PRESETS.filter((p) => !shown.has(p.nutrientKey)).map((p) =>
    fieldFromKey(p.nutrientKey),
  );
}

/** "Fica como 450 kcal · P10 C60 G18 por 100 g", ao vivo enquanto digita. */
export function per100Preview(form: CustomFoodForm): string | null {
  if (form.basis === '100g') return 'Valores já por 100 g';
  const parsed = customFoodFromForm({ ...form, nutrients: {}, barcode: '' });
  if (!parsed.ok) return null;
  const i = parsed.input;
  return (
    `Fica como ${fmt(i.kcalPer100g)} kcal · P${fmt(i.proteinPer100g)} ` +
    `C${fmt(i.carbsPer100g)} G${fmt(i.fatPer100g)} por 100 g`
  );
}
