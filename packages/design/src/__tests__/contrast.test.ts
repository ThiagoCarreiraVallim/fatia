import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToRgb, isHexColor, normalizeHex, relativeLuminance } from '../contrast';

/** Pares com a razão conhecida (WebAIM, arredondada a 2 casas). */
describe('contrastRatio', () => {
  it.each([
    ['#7C5CFF', '#FFFFFF', 4.35],
    ['#6A4AE0', '#FFFFFF', 5.72],
    ['#9AA593', '#343434', 4.85],
    ['#2CE500', '#0B1A05', 10.58],
    ['#000000', '#FFFFFF', 21],
    ['#777777', '#777777', 1],
  ])('%s sobre %s dá %s:1', (a, b, esperado) => {
    expect(contrastRatio(a, b)).toBeCloseTo(esperado, 2);
  });

  it('é simétrica', () => {
    expect(contrastRatio('#131313', '#E5E2E1')).toBe(contrastRatio('#E5E2E1', '#131313'));
  });
});

describe('relativeLuminance', () => {
  it('vai de 0 (preto) a 1 (branco)', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBe(1);
  });
});

describe('hex', () => {
  it('aceita #rgb e #rrggbb, com ou sem maiúsculas', () => {
    expect(normalizeHex('#AbC')).toBe('#aabbcc');
    expect(normalizeHex('#2CE500')).toBe('#2ce500');
    expect(hexToRgb('#ff7a1a')).toEqual([255, 122, 26]);
  });

  it('recusa o que não é cor hex', () => {
    for (const ruim of ['', 'ff7a1a', '#ff7a1', '#gggggg', 'rgb(0,0,0)', '#ff7a1a00']) {
      expect(isHexColor(ruim)).toBe(false);
    }
    expect(() => hexToRgb('azul')).toThrow();
  });
});
