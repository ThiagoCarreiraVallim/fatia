import { describe, expect, it } from 'vitest';
import { GOAL_STEP, goalBand, stepGoalText } from '../nutrition-plan';

describe('stepGoalText (− e + das metas, Al-N6)', () => {
  it('anda um passo a partir do que foi digitado, no múltiplo do passo', () => {
    expect(stepGoalText('1800', GOAL_STEP.kcalMin, 1)).toBe('1850');
    expect(stepGoalText('1.830', GOAL_STEP.kcalMin, 1)).toBe('1850');
    expect(stepGoalText('1830', GOAL_STEP.kcalMin, -1)).toBe('1800');
  });

  it('água vai de 0,25 L em 0,25 L, com vírgula', () => {
    expect(stepGoalText('2,5', GOAL_STEP.waterL, 1)).toBe('2,75');
    expect(stepGoalText('2,5', GOAL_STEP.waterL, -1)).toBe('2,25');
  });

  it('nunca desce abaixo de zero; vazio ou ilegível começa de zero', () => {
    expect(stepGoalText('0', GOAL_STEP.weeklyWorkouts, -1)).toBe('0');
    expect(stepGoalText('', GOAL_STEP.dailyStepsTarget, 1)).toBe('500');
    expect(stepGoalText('abc', GOAL_STEP.proteinMinG, 1)).toBe('5');
  });
});

describe('goalBand (a faixa desenhada na barra)', () => {
  it('posiciona mínimo e máximo numa escala até 1,6× o máximo', () => {
    expect(goalBand('1800', '2200')).toEqual({ left: 51.1, width: 11.4 });
  });

  it('sem faixa legível não desenha nada', () => {
    expect(goalBand('', '2200')).toBeNull();
    expect(goalBand('300', '200')).toBeNull();
  });
});
