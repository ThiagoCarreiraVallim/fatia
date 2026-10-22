import type { Food, FoodPortion, FoodShortcut } from './nutrition';

/**
 * Medidas caseiras ("2 × colher de sopa") no registro de refeição, comum ao PWA
 * e ao app. A API converte a medida em gramas; aqui fica só o que a tela
 * precisa para mostrar a conta antes de gravar e o texto depois.
 */

/** Quantidade em gramas digitadas, ou em medida × quantidade. */
export type Amount =
  { kind: 'grams'; grams: string } | { kind: 'portion'; portionId: string; quantity: number };

export const MIN_QUANTITY = 0.5;
export const MAX_QUANTITY = 20;
const STEP = 0.5;

const FRACOES: Record<string, string> = { '0.25': '¼', '0.5': '½' };

/** 0,5 → "½", 1,5 → "1½", 1,75 → "1,75": fração só onde se fala assim. */
export function formatQuantity(quantity: number): string {
  const inteiro = Math.floor(quantity);
  const resto = Math.round((quantity - inteiro) * 100) / 100;
  if (resto === 0) return String(inteiro);
  const fracao = FRACOES[String(resto)];
  if (fracao) return inteiro === 0 ? fracao : `${inteiro}${fracao}`;
  return quantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/** De meio em meio. Valor fora da grade (¼ vindo do MCP) encaixa no meio seguinte. */
export function stepQuantity(quantity: number, direction: 1 | -1): number {
  const snapped =
    direction > 0
      ? Math.floor(quantity / STEP) * STEP + STEP
      : Math.ceil(quantity / STEP) * STEP - STEP;
  return Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, snapped));
}

/** "2 × colher de sopa". O "×" evita conjugar o plural do rótulo, que é texto livre. */
export function portionText(label: string, quantity: number): string {
  return `${formatQuantity(quantity)} × ${label}`;
}

/** Uma casa decimal, a mesma conta do servidor (`gramsFromPortion`). */
export function gramsFor(portionGrams: number, quantity: number): number {
  return Math.round(portionGrams * quantity * 10) / 10;
}

/**
 * O que o campo já traz ao escolher o alimento: a medida da última vez, se ela
 * ainda existe; senão as gramas da última vez; senão 100 g.
 */
export function initialAmount(food: Food & Partial<FoodShortcut>): Amount {
  const last = food.lastPortionLabel
    ? food.portions?.find((p) => p.label === food.lastPortionLabel)
    : undefined;
  if (last && food.lastPortionQuantity) {
    return { kind: 'portion', portionId: last.id, quantity: food.lastPortionQuantity };
  }
  const lastGrams = food.lastGrams;
  return {
    kind: 'grams',
    grams: lastGrams && lastGrams > 0 ? String(Math.round(lastGrams)) : '100',
  };
}

/** Gramas que vão ser gravadas, ou `null` se ainda não dá para gravar. */
export function amountGrams(amount: Amount, portions: FoodPortion[]): number | null {
  if (amount.kind === 'grams') {
    const grams = Number(amount.grams.replace(',', '.'));
    return Number.isFinite(grams) && grams > 0 ? grams : null;
  }
  const portion = portions.find((p) => p.id === amount.portionId);
  return portion ? gramsFor(portion.grams, amount.quantity) : null;
}

/** Corpo do item para a API: gramas, ou a medida para o servidor converter. */
export function amountPayload(
  amount: Amount,
): { grams: number } | { portionId: string; quantity: number } {
  return amount.kind === 'grams'
    ? { grams: Number(amount.grams.replace(',', '.')) }
    : { portionId: amount.portionId, quantity: amount.quantity };
}

/** "2 × colher de sopa (50 g)" ou "120 g" — a quantidade de um item já gravado. */
export function itemAmountText(item: {
  grams: number;
  portionLabel?: string | null;
  portionQuantity?: number | null;
}): string {
  const grams = `${Math.round(item.grams)} g`;
  return item.portionLabel && item.portionQuantity
    ? `${portionText(item.portionLabel, item.portionQuantity)} (${grams})`
    : grams;
}
