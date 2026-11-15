import { describe, expect, it } from 'vitest';
import { weightSparkPath } from '@fatia/api-client';
import { polylineLength } from '../spark';

/**
 * O traço de 30 dias da folha de peso se desenha (Al-H4, 1,4 s). No app o
 * `pathLength` do SVG não vale em todo Android, então o comprimento real do
 * traço sai da própria linha.
 */
describe('polylineLength', () => {
  it('soma os segmentos de um traço M/L', () => {
    expect(polylineLength('M0 0 L3 4 L3 10')).toBe(11);
  });

  it('linha reta do traço de um ponto só', () => {
    expect(polylineLength(weightSparkPath([70], 300, 60))).toBe(300);
  });

  it('traço vazio mede zero', () => {
    expect(polylineLength('')).toBe(0);
  });
});
