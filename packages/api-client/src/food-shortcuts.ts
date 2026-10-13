import type { Food, FoodShortcut, FoodShortcuts } from './nutrition';
import { portionText } from './portions';

/**
 * Lógica dos atalhos da busca de alimento, comum ao PWA e ao app.
 *
 * Mora aqui, e não em cada drawer, porque a regra de "o que aparece onde" é a
 * mesma nos dois e já divergiu antes em outras telas.
 */

/**
 * Atualização otimista da estrela: favoritar move o alimento para o topo dos
 * favoritos (levando o histórico, se ele estava nos recentes); desfavoritar o
 * tira dos favoritos. Em ambos os casos ele sai dos recentes até a próxima
 * busca no servidor, que é quem decide se ele volta para lá.
 */
export function withFavorite(
  prev: FoodShortcuts | undefined,
  food: Food,
  favorite: boolean,
): FoodShortcuts {
  const base = prev ?? { favorites: [], recent: [] };
  const known =
    base.favorites.find((f) => f.id === food.id) ?? base.recent.find((f) => f.id === food.id);
  const others = base.favorites.filter((f) => f.id !== food.id);
  const entry: FoodShortcut = {
    ...food,
    lastGrams: known?.lastGrams ?? null,
    lastPortionLabel: known?.lastPortionLabel ?? null,
    lastPortionQuantity: known?.lastPortionQuantity ?? null,
    timesEaten: known?.timesEaten ?? 0,
    favorite: true,
  };
  return {
    favorites: favorite ? [entry, ...others] : others,
    recent: base.recent.filter((f) => f.id !== food.id),
  };
}

export type ShortcutRow =
  { kind: 'header'; title: 'Favoritos' | 'Recentes' } | { kind: 'food'; food: FoodShortcut };

/** Seções achatadas numa lista só, para `FlatList`; seção vazia não ganha título. */
export function shortcutRows(shortcuts: FoodShortcuts | undefined): ShortcutRow[] {
  if (!shortcuts) return [];
  const rows: ShortcutRow[] = [];
  for (const [title, foods] of [
    ['Favoritos', shortcuts.favorites],
    ['Recentes', shortcuts.recent],
  ] as const) {
    if (foods.length === 0) continue;
    rows.push({ kind: 'header', title });
    for (const food of foods) rows.push({ kind: 'food', food });
  }
  return rows;
}

/** Gramagem que o campo já traz ao escolher: a da última vez, ou 100 g. */
export function initialGrams(lastGrams: number | null | undefined): string {
  return lastGrams && lastGrams > 0 ? String(Math.round(lastGrams)) : '100';
}

/** Linha de apoio do atalho: a porção de sempre vale mais que o kcal/100g. */
export function shortcutDetail(food: FoodShortcut): string {
  const kcal = `${Math.round(food.kcalPer100g)} kcal/100g`;
  if (food.lastPortionLabel && food.lastPortionQuantity) {
    return `${portionText(food.lastPortionLabel, food.lastPortionQuantity)} da última vez · ${kcal}`;
  }
  return food.lastGrams ? `${Math.round(food.lastGrams)} g da última vez · ${kcal}` : kcal;
}
