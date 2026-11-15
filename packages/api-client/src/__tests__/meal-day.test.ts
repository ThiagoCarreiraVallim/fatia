import { describe, expect, it } from 'vitest';
import {
  dayNutrientBar,
  dayNutrientRangeText,
  dayNutrientStatusText,
  mealHasAiItems,
  mealNutrientValue,
  mealShareOfDay,
  mealSummary,
  copyTargetDays,
  parseDecimalInput,
  scaleMealItem,
} from '../meal-day';
import type { DayNutrient, Meal } from '../nutrition';

const n = (over: Partial<DayNutrient>): DayNutrient => ({
  key: 'kcal',
  label: 'Calorias',
  unit: 'kcal',
  value: 0,
  min: null,
  max: null,
  status: 'none',
  ...over,
});

const meal: Meal = {
  id: 'm1',
  userId: 'u',
  mealType: 'LUNCH',
  eatenAt: '2026-11-15T15:41:00Z',
  notes: null,
  items: [
    {
      id: 'i1',
      mealId: 'm1',
      foodId: 1,
      foodName: 'Arroz branco',
      groupId: null,
      grams: 100,
      kcal: 128,
      proteinG: 2.5,
      carbsG: 28,
      fatG: 0.2,
      nutrients: { fiber_g: 1.6, sodium_mg: 1 },
      source: 'AI',
    },
    {
      id: 'i2',
      mealId: 'm1',
      foodId: null,
      foodName: 'Frango grelhado',
      groupId: null,
      grams: 150,
      kcal: 240,
      proteinG: 45,
      carbsG: 0,
      fatG: 5,
      nutrients: null,
      source: 'MANUAL',
    },
  ],
};

describe('faixa de um nutriente no dia (#374)', () => {
  it('escreve a faixa como a tela do dia mostra', () => {
    expect(dayNutrientRangeText(n({ min: 1800, max: 2200 }))).toBe('1.800–2.200 kcal');
    expect(dayNutrientRangeText(n({ unit: 'g', min: 25 }))).toBe('mín 25 g');
    expect(dayNutrientRangeText(n({ unit: 'mg', max: 2000 }))).toBe('até 2.000 mg');
    expect(dayNutrientRangeText(n({}))).toBe('sem meta');
  });

  it('diz o estado: falta, passou, na faixa, mínimo batido, dentro do limite', () => {
    expect(dayNutrientStatusText(n({ value: 1500, min: 1800, max: 2200, status: 'under' }))).toBe(
      'faltam 300 kcal',
    );
    expect(dayNutrientStatusText(n({ unit: 'mg', value: 2100.4, max: 2000, status: 'over' }))).toBe(
      'passou 100 mg',
    );
    expect(dayNutrientStatusText(n({ value: 2000, min: 1800, max: 2200, status: 'ok' }))).toBe(
      'na faixa',
    );
    expect(dayNutrientStatusText(n({ unit: 'g', value: 30, min: 25, status: 'ok' }))).toBe(
      'mínimo batido',
    );
    expect(dayNutrientStatusText(n({ unit: 'mg', value: 30, max: 400, status: 'ok' }))).toBe(
      'dentro do limite',
    );
    expect(dayNutrientStatusText(n({ value: 30 }))).toBe('sem meta');
  });

  it('a barra tem a faixa marcada e não passa de 100%', () => {
    expect(dayNutrientBar(n({ value: 1100, min: 1800, max: 2200 }))).toEqual({
      fill: 41.67,
      lo: 68.18,
      hi: 83.33,
    });
    expect(dayNutrientBar(n({ value: 9000, max: 2000 })).fill).toBe(100);
    expect(dayNutrientBar(n({ value: 10, min: 25 }))).toEqual({ fill: 26.67, lo: 66.67, hi: null });
    expect(dayNutrientBar(n({ value: 0 }))).toEqual({ fill: 0, lo: null, hi: null });
  });
});

describe('a refeição no "De onde veio"', () => {
  it('soma o nutriente da refeição, macro ou micro', () => {
    expect(mealNutrientValue(meal, 'kcal')).toBe(368);
    expect(mealNutrientValue(meal, 'protein_g')).toBe(47.5);
    expect(mealNutrientValue(meal, 'fiber_g')).toBe(1.6);
    expect(mealNutrientValue(meal, 'caffeine_mg')).toBe(0);
  });

  it('% do dia arredondado, sem dividir por zero', () => {
    expect(mealShareOfDay(368, 1200)).toBe(31);
    expect(mealShareOfDay(10, 0)).toBe(0);
  });

  it('resumo pelos nomes, e o selo da IA por item ou pela origem', () => {
    expect(mealSummary(meal)).toBe('Arroz branco, Frango grelhado');
    expect(mealHasAiItems(meal)).toBe(true);
    expect(mealHasAiItems({ ...meal, items: [meal.items[1]] })).toBe(false);
    expect(mealHasAiItems({ ...meal, items: [], origin: 'AI' })).toBe(true);
  });
});

describe('campo numérico digitável', () => {
  it('aceita vírgula ou ponto e recusa o resto', () => {
    expect(parseDecimalInput('1,5')).toBe(1.5);
    expect(parseDecimalInput(' 120 ')).toBe(120);
    expect(parseDecimalInput('2.25')).toBe(2.25);
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput('12,')).toBeNull();
    expect(parseDecimalInput('abc')).toBeNull();
    expect(parseDecimalInput('-3')).toBeNull();
  });
});

describe('editar item e copiar (N14, N9)', () => {
  it('refaz as contas do item na quantidade nova', () => {
    expect(scaleMealItem(meal.items[0], 150)).toEqual({
      kcal: 192,
      proteinG: 3.8,
      carbsG: 42,
      fatG: 0.3,
      fiberG: 2.4,
      sodiumMg: 2,
    });
    expect(scaleMealItem({ ...meal.items[0], grams: 0 }, 50).kcal).toBe(0);
  });

  it('oferece os próximos dias como chips, sem o dia de origem', () => {
    expect(copyTargetDays('2026-11-15', '2026-11-15')).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
    ]);
    expect(copyTargetDays('2026-11-14', '2026-11-15', 3)).toEqual([
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
    ]);
  });
});
