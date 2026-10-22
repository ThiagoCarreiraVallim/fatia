import { describe, expect, it } from 'vitest';
import {
  mealItemRestoreInput,
  stepsRestoreInput,
  undoMessage,
  waterRestoreInput,
  weightRestoreInput,
} from '../undo';

describe('retrato para desfazer', () => {
  it('água e passos voltam no mesmo dia, sem a hora', () => {
    expect(waterRestoreInput({ ml: 333, date: '2026-10-13T00:00:00.000Z', notes: null })).toEqual({
      ml: 333,
      date: '2026-10-13',
    });
    expect(stepsRestoreInput({ steps: 4321, date: '2026-10-13', notes: 'caminhada' })).toEqual({
      steps: 4321,
      date: '2026-10-13',
      notes: 'caminhada',
    });
  });

  it('peso volta no mesmo instante', () => {
    expect(
      weightRestoreInput({ weightKg: 77.7, loggedAt: '2026-10-13T21:30:00.000Z', notes: null }),
    ).toEqual({ weightKg: 77.7, loggedAt: '2026-10-13T21:30:00.000Z' });
  });

  it('item do catálogo volta pelas gramas e pelo nome; os valores a API recalcula', () => {
    const item = {
      foodId: 12,
      foodName: 'Arroz do almoço',
      grams: 50,
      kcal: 64,
      proteinG: 1.3,
      carbsG: 14,
      fatG: 0.1,
    };
    expect(mealItemRestoreInput(item)).toEqual({
      foodId: 12,
      foodName: 'Arroz do almoço',
      grams: 50,
    });
  });

  it('item livre volta com os valores que tinha', () => {
    const item = {
      foodId: null,
      foodName: 'Bolo da vó',
      grams: 80,
      kcal: 300,
      proteinG: 4,
      carbsG: 40,
      fatG: 12,
    };
    expect(mealItemRestoreInput(item)).toEqual({
      foodName: 'Bolo da vó',
      grams: 80,
      kcal: 300,
      proteinG: 4,
      carbsG: 40,
      fatG: 12,
    });
  });

  it('cada tipo tem a sua mensagem', () => {
    expect(undoMessage('water')).toBe('Registro de água apagado');
    expect(undoMessage('mealItem')).toBe('Item apagado');
  });
});
