import { describe, expect, it } from 'vitest';
import { countUpValue, motionTiming } from '../motion-values';

describe('movimento no app', () => {
  it('usa as durações do design system', () => {
    expect(motionTiming('sheet', false)).toEqual({ duration: 550, delay: 0 });
    expect(motionTiming('fast', false).duration).toBe(150);
    expect(motionTiming('data', false).duration).toBe(1300);
  });

  it('cascata: 70 ms por item', () => {
    expect(motionTiming('sheet', false, { index: 3, stagger: 'list' }).delay).toBe(210);
  });

  it('reduzir movimento devolve duração e atraso 0', () => {
    expect(motionTiming('sheet', true)).toEqual({ duration: 0, delay: 0 });
    expect(motionTiming('data', true, { index: 5, stagger: 'bars' })).toEqual({
      duration: 0,
      delay: 0,
    });
  });
});

describe('countUpValue', () => {
  it('vai de 0 ao alvo e para no alvo', () => {
    expect(countUpValue(1066, 0, 1300)).toBe(0);
    expect(countUpValue(1066, 1300, 1300)).toBe(1066);
    expect(countUpValue(1066, 5000, 1300)).toBe(1066);
  });

  it('sobe sem passar do alvo e em inteiro', () => {
    const meio = countUpValue(1066, 650, 1300);
    expect(meio).toBeGreaterThan(0);
    expect(meio).toBeLessThan(1066);
    expect(Number.isInteger(meio)).toBe(true);
  });

  it('com duração 0 (reduzir movimento) já começa no alvo', () => {
    expect(countUpValue(1066, 0, 0)).toBe(1066);
  });
});
