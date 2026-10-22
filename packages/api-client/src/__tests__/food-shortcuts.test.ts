import { describe, expect, it } from 'vitest';
import { initialGrams, shortcutDetail, shortcutRows, withFavorite } from '../food-shortcuts';
import type { FoodShortcut } from '../nutrition';

const food = (id: number, extra: Partial<FoodShortcut> = {}): FoodShortcut => ({
  id,
  name: `Alimento ${id}`,
  source: 'TACO',
  groupId: null,
  kcalPer100g: 130.4,
  proteinPer100g: 1,
  carbsPer100g: 1,
  fatPer100g: 1,
  createdByUserId: null,
  lastGrams: null,
  timesEaten: 0,
  favorite: false,
  ...extra,
});

describe('withFavorite', () => {
  it('favoritar um recente leva o histórico para o topo dos favoritos', () => {
    const next = withFavorite(
      { favorites: [food(1, { favorite: true })], recent: [food(2, { lastGrams: 120 })] },
      food(2),
      true,
    );
    expect(next.favorites.map((f) => [f.id, f.lastGrams, f.favorite])).toEqual([
      [2, 120, true],
      [1, null, true],
    ]);
    expect(next.recent).toEqual([]);
  });

  it('desfavoritar tira dos favoritos', () => {
    const next = withFavorite({ favorites: [food(1)], recent: [] }, food(1), false);
    expect(next.favorites).toEqual([]);
  });

  it('funciona sem cache ainda carregado', () => {
    expect(withFavorite(undefined, food(3), true).favorites.map((f) => f.id)).toEqual([3]);
  });

  it('favoritar duas vezes não duplica', () => {
    const once = withFavorite(undefined, food(3), true);
    expect(withFavorite(once, food(3), true).favorites).toHaveLength(1);
  });
});

describe('shortcutRows', () => {
  it('achata as seções e omite título de seção vazia', () => {
    expect(shortcutRows({ favorites: [], recent: [food(2)] })).toEqual([
      { kind: 'header', title: 'Recentes' },
      { kind: 'food', food: food(2) },
    ]);
    expect(shortcutRows(undefined)).toEqual([]);
  });

  it('favoritos vêm antes dos recentes', () => {
    const rows = shortcutRows({ favorites: [food(1)], recent: [food(2)] });
    expect(
      rows.map((r) => (r.kind === 'header' ? r.title : r.kind === 'food' ? r.food.id : r)),
    ).toEqual(['Favoritos', 1, 'Recentes', 2]);
  });

  it('refeições salvas vêm primeiro: registram a refeição inteira de uma vez', () => {
    const cafe = { id: 't1', name: 'Café de sempre', mealType: null, items: [] };
    const rows = shortcutRows({ favorites: [food(1)], recent: [] }, [cafe]);
    expect(rows).toEqual([
      { kind: 'header', title: 'Refeições salvas' },
      { kind: 'template', template: cafe },
      { kind: 'header', title: 'Favoritos' },
      { kind: 'food', food: food(1) },
    ]);
    expect(shortcutRows(undefined, [cafe])).toHaveLength(2);
  });
});

describe('initialGrams e shortcutDetail', () => {
  it('usa a gramagem da última vez, arredondada, ou 100', () => {
    expect(initialGrams(179.6)).toBe('180');
    expect(initialGrams(null)).toBe('100');
    expect(initialGrams(0)).toBe('100');
  });

  it('descreve a porção de sempre quando existe', () => {
    expect(shortcutDetail(food(1, { lastGrams: 50 }))).toBe('50 g da última vez · 130 kcal/100g');
    expect(shortcutDetail(food(1))).toBe('130 kcal/100g');
  });
});
