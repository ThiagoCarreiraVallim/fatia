import { describe, expect, it } from 'vitest';
import {
  amountGrams,
  amountPayload,
  formatQuantity,
  gramsFor,
  initialAmount,
  itemAmountText,
  portionText,
  stepQuantity,
} from '../portions';
import { shortcutDetail, withFavorite } from '../food-shortcuts';
import type { FoodPortion, FoodShortcut } from '../nutrition';

const colher: FoodPortion = { id: 'p1', label: 'colher de sopa', grams: 25, mine: false };
const concha: FoodPortion = { id: 'p2', label: 'minha concha', grams: 140, mine: true };

const food = (extra: Partial<FoodShortcut> = {}): FoodShortcut => ({
  id: 1,
  name: 'Arroz, tipo 1, cozido',
  source: 'TACO',
  groupId: null,
  kcalPer100g: 128,
  proteinPer100g: 2.5,
  carbsPer100g: 28,
  fatPer100g: 0.2,
  createdByUserId: null,
  portions: [colher, concha],
  lastGrams: null,
  lastPortionLabel: null,
  lastPortionQuantity: null,
  timesEaten: 0,
  favorite: false,
  ...extra,
});

describe('quantidade', () => {
  it('mostra frações como se fala', () => {
    expect([0.25, 0.5, 1, 1.5, 2, 2.5, 3, 1.75].map(formatQuantity)).toEqual([
      '¼',
      '½',
      '1',
      '1½',
      '2',
      '2½',
      '3',
      '1,75',
    ]);
  });

  it('o stepper anda de meio em meio, sem passar de ½ nem de 20', () => {
    expect(stepQuantity(1, 1)).toBe(1.5);
    expect(stepQuantity(1, -1)).toBe(0.5);
    expect(stepQuantity(0.5, -1)).toBe(0.5);
    expect(stepQuantity(20, 1)).toBe(20);
    // Um quarto que veio do MCP sobe para o meio seguinte, sem ficar em 0,75.
    expect(stepQuantity(0.25, 1)).toBe(0.5);
  });

  it('o "×" evita o plural errado: "2 × colher de sopa", não "2 colher de sopa"', () => {
    expect(portionText('colher de sopa', 2)).toBe('2 × colher de sopa');
    expect(portionText('unidade', 0.5)).toBe('½ × unidade');
  });

  it('gramas da medida com uma casa, como o servidor grava', () => {
    expect(gramsFor(25, 2)).toBe(50);
    expect(gramsFor(15, 0.5)).toBe(7.5);
    expect(gramsFor(13, 1 / 3)).toBe(4.3);
  });
});

describe('initialAmount', () => {
  it('sem histórico: 100 g', () => {
    expect(initialAmount(food())).toEqual({ kind: 'grams', grams: '100' });
  });

  it('da última vez em gramas: as mesmas gramas', () => {
    expect(initialAmount(food({ lastGrams: 180 }))).toEqual({ kind: 'grams', grams: '180' });
  });

  it('da última vez em medida: a mesma medida e quantidade', () => {
    expect(
      initialAmount(
        food({ lastGrams: 50, lastPortionLabel: 'colher de sopa', lastPortionQuantity: 2 }),
      ),
    ).toEqual({ kind: 'portion', portionId: 'p1', quantity: 2 });
  });

  it('medida que não existe mais: cai para as gramas da última vez', () => {
    expect(
      initialAmount(food({ lastGrams: 50, lastPortionLabel: 'apagada', lastPortionQuantity: 2 })),
    ).toEqual({ kind: 'grams', grams: '50' });
  });

  it('alimento da busca, sem histórico nem medidas carregadas', () => {
    const { lastGrams, lastPortionLabel, lastPortionQuantity, ...semHistorico } = food({
      portions: undefined,
    });
    void lastGrams;
    void lastPortionLabel;
    void lastPortionQuantity;
    expect(initialAmount(semHistorico)).toEqual({ kind: 'grams', grams: '100' });
  });
});

describe('amountGrams e amountPayload', () => {
  it('gramas digitadas', () => {
    expect(amountGrams({ kind: 'grams', grams: '120' }, [])).toBe(120);
    expect(amountGrams({ kind: 'grams', grams: '' }, [])).toBeNull();
    expect(amountGrams({ kind: 'grams', grams: '0' }, [])).toBeNull();
    expect(amountPayload({ kind: 'grams', grams: '120' })).toEqual({ grams: 120 });
  });

  it('medida: as gramas para a prévia, o portionId para o servidor', () => {
    const amount = { kind: 'portion' as const, portionId: 'p2', quantity: 0.5 };
    expect(amountGrams(amount, [colher, concha])).toBe(70);
    expect(amountPayload(amount)).toEqual({ portionId: 'p2', quantity: 0.5 });
  });

  it('medida que sumiu da lista não tem gramas', () => {
    expect(amountGrams({ kind: 'portion', portionId: 'x', quantity: 1 }, [colher])).toBeNull();
  });
});

describe('itemAmountText', () => {
  it('item em medida: como foi dito e as gramas', () => {
    expect(itemAmountText({ grams: 50, portionLabel: 'colher de sopa', portionQuantity: 2 })).toBe(
      '2 × colher de sopa (50 g)',
    );
  });

  it('item em gramas', () => {
    expect(itemAmountText({ grams: 120.4 })).toBe('120 g');
  });
});

describe('atalhos com medida', () => {
  it('a linha do atalho diz a medida da última vez', () => {
    expect(
      shortcutDetail(
        food({ lastGrams: 50, lastPortionLabel: 'colher de sopa', lastPortionQuantity: 2 }),
      ),
    ).toBe('2 × colher de sopa da última vez · 128 kcal/100g');
  });

  it('favoritar leva junto a medida da última vez', () => {
    const recente = food({
      lastGrams: 50,
      lastPortionLabel: 'colher de sopa',
      lastPortionQuantity: 2,
    });
    const next = withFavorite({ favorites: [], recent: [recente] }, recente, true);
    expect(next.favorites[0]).toMatchObject({
      lastPortionLabel: 'colher de sopa',
      lastPortionQuantity: 2,
    });
  });
});
