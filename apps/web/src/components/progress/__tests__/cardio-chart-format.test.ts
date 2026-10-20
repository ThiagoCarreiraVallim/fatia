import { describe, expect, it } from 'vitest';
import { formatCardioValue } from '../cardio-chart';

/** Os mesmos números do gráfico de cardio do app: vírgula decimal e ponto de milhar. */
describe('formatCardioValue', () => {
  it('distância em km com vírgula', () => {
    expect(formatCardioValue('distance', 5250)).toBe('5,25 km');
  });

  it('calorias com ponto de milhar', () => {
    expect(formatCardioValue('kcal', 1234)).toBe('1.234 kcal');
  });

  it('duração e pace em minutos e segundos', () => {
    expect(formatCardioValue('duration', 330)).toBe('5:30');
    expect(formatCardioValue('pace', 330)).toBe('5:30 /km');
  });
});
