import { describe, expect, it } from 'vitest';
import type { SessionSet } from '@fatia/api-client';
import { formatDistance, formatPreviousSet, loadValue, previousCells } from '../format';

/**
 * As séries na unidade da pessoa (Você › Unidades, #387). Em kg e km nada muda
 * — é o padrão do Brasil e o que os outros testes já cobrem.
 */
const forca = { weightKg: 100, reps: 8, rpe: 8 } as SessionSet;
const corrida = { durationSeconds: 1800, distanceMeters: 5200, avgHeartRate: 150 } as SessionSet;

describe('séries na unidade da pessoa', () => {
  it('em lb a carga vem com uma casa e o rótulo certo', () => {
    const lb = { loadUnit: 'LB', distanceUnit: 'KM' } as const;
    expect(loadValue(100, lb)).toBe('220,5');
    expect(formatPreviousSet(forca, false, lb)).toBe('220,5 lb × 8 · RPE 8');
    expect(previousCells(forca, false, lb)).toEqual(['8', '220,5', '8']);
  });

  it('em kg continua igual ao de antes', () => {
    expect(formatPreviousSet(forca, false)).toBe('100 kg × 8 · RPE 8');
    expect(loadValue(82.5)).toBe('82,5');
  });

  it('distância em milhas ou metros', () => {
    expect(formatDistance(5200)).toBe('5,20 km');
    expect(formatDistance(5200, 'MI')).toBe('3,2 milhas');
    expect(previousCells(corrida, true, { loadUnit: 'KG', distanceUnit: 'M' })[1]).toBe('5.200 m');
  });
});
