import { describe, expect, it } from 'vitest';
import { QUICK_ADD_ITEMS, mealTypeForTime, showQuickAdd, workoutQuickLabel } from '../quick-add';

const hora = (h: number, m = 0) => new Date(2026, 9, 14, h, m);

describe('mealTypeForTime', () => {
  it('sugere a refeição pela hora local', () => {
    expect(mealTypeForTime(hora(7))).toBe('BREAKFAST');
    expect(mealTypeForTime(hora(10, 29))).toBe('BREAKFAST');
    expect(mealTypeForTime(hora(10, 30))).toBe('LUNCH');
    expect(mealTypeForTime(hora(14, 59))).toBe('LUNCH');
    expect(mealTypeForTime(hora(15))).toBe('SNACK');
    expect(mealTypeForTime(hora(18))).toBe('DINNER');
    expect(mealTypeForTime(hora(23, 59))).toBe('DINNER');
  });

  it('madrugada é lanche, não café da manhã', () => {
    expect(mealTypeForTime(hora(0))).toBe('SNACK');
    expect(mealTypeForTime(hora(4, 59))).toBe('SNACK');
    expect(mealTypeForTime(hora(5))).toBe('BREAKFAST');
  });
});

describe('QUICK_ADD_ITEMS', () => {
  it('lista os cinco registros na ordem do menu', () => {
    expect(QUICK_ADD_ITEMS.map((i) => i.label)).toEqual([
      'Refeição',
      'Água',
      'Peso',
      'Passos',
      'Treino',
    ]);
  });
});

describe('workoutQuickLabel', () => {
  it('retoma a sessão aberta em vez de começar outra', () => {
    expect(workoutQuickLabel(true)).toBe('Continuar treino');
    expect(workoutQuickLabel(false)).toBe('Começar treino livre');
  });
});

describe('showQuickAdd', () => {
  it('aparece nas telas do app', () => {
    for (const p of ['/', '/nutrition', '/progress', '/workout', '/workout/plans/1', '/profile']) {
      expect(showQuickAdd(p)).toBe(true);
    }
  });

  it('some no chat e na sessão de treino', () => {
    for (const p of ['/chat', '/chat/abc', '/workout/session/xyz']) {
      expect(showQuickAdd(p)).toBe(false);
    }
  });

  it('não confunde rotas com o mesmo começo', () => {
    expect(showQuickAdd('/chatter')).toBe(true);
    expect(showQuickAdd('/workout/sessions')).toBe(true);
  });
});
