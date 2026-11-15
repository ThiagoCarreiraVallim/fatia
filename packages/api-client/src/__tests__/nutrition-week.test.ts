import { describe, expect, it } from 'vitest';
import {
  MEAL_TYPICAL_TIME,
  emptyMealHint,
  historyDaysForWeek,
  nutritionWeek,
  shiftWeek,
} from '../nutrition-week';
import type { DayNutrient } from '../nutrition';

describe('faixa de dias da Nutrição (Al-N1)', () => {
  it('mostra a semana de segunda a domingo do dia escolhido', () => {
    // 2026-11-15 é domingo: a semana começa na segunda, 9.
    const week = nutritionWeek('2026-11-15', []);
    expect(week.map((d) => d.iso)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
    expect(week.map((d) => d.weekday).join('')).toBe('STQQSSD');
    expect(week.map((d) => d.day)).toEqual([9, 10, 11, 12, 13, 14, 15]);
    expect(week[0]!.label).toBe('segunda, 9 de novembro');
  });

  it('marca como feito o dia com refeição no histórico', () => {
    const week = nutritionWeek('2026-11-11', [
      { date: '2026-11-09', meals: 2 },
      { date: '2026-11-10', meals: 0 },
      { date: '2026-11-11', meals: 1 },
    ]);
    expect(week.map((d) => !!d.done)).toEqual([true, false, true, false, false, false, false]);
  });

  it('pede ao histórico os dias desde a segunda até hoje', () => {
    expect(historyDaysForWeek('2026-11-15', '2026-11-15')).toBe(7);
    expect(historyDaysForWeek('2026-11-11', '2026-11-11')).toBe(3);
    // Semana passada: da segunda dela até hoje.
    expect(historyDaysForWeek('2026-11-04', '2026-11-15')).toBe(14);
    // Semana futura: nada para buscar, mas a API pede pelo menos 1.
    expect(historyDaysForWeek('2026-11-20', '2026-11-15')).toBe(1);
    // A API não passa de 90 dias.
    expect(historyDaysForWeek('2025-01-01', '2026-11-15')).toBe(90);
  });

  it('anda uma semana para trás e para a frente', () => {
    expect(shiftWeek('2026-11-15', -1)).toBe('2026-11-08');
    expect(shiftWeek('2026-11-15', 1)).toBe('2026-11-22');
  });
});

describe('refeição ainda vazia no "De onde veio"', () => {
  const kcal = (over: Partial<DayNutrient>): DayNutrient => ({
    key: 'kcal',
    label: 'Calorias',
    unit: 'kcal',
    value: 826,
    min: 1800,
    max: 2200,
    status: 'under',
    ...over,
  });

  it('tem o horário de costume de cada tipo', () => {
    expect(MEAL_TYPICAL_TIME).toEqual({
      BREAKFAST: '07:00',
      LUNCH: '12:00',
      SNACK: '16:00',
      DINNER: '20:00',
    });
  });

  it('diz quanto ainda cabe até o máximo', () => {
    expect(emptyMealHint(kcal({}))).toBe('cabem até 1.374 kcal');
  });

  it('acima do máximo, diz que passou; sem máximo, convida a registrar', () => {
    expect(emptyMealHint(kcal({ value: 2300 }))).toBe('acima do máximo de hoje');
    expect(emptyMealHint(kcal({ max: null }))).toBe('Toque para registrar');
  });
});
