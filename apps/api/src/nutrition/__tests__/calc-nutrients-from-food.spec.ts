import { calcNutrientsFromFood } from '../helpers/calc-macros';

describe('calcNutrientsFromFood', () => {
  it('scales each nutrient by grams/100 (rule of three)', () => {
    const out = calcNutrientsFromFood({ sodium_mg: 1.24, potassium_mg: 75.15 }, 200);
    expect(out).toEqual({ sodium_mg: 2.48, potassium_mg: 150.3 });
  });

  it('rounds to 2 decimals', () => {
    const out = calcNutrientsFromFood({ sodium_mg: 1.237 }, 100);
    expect(out).toEqual({ sodium_mg: 1.24 });
  });

  it('ignores non-numeric values', () => {
    const out = calcNutrientsFromFood({ sodium_mg: 10, junk: 'x' as unknown as number }, 100);
    expect(out).toEqual({ sodium_mg: 10 });
  });

  it('returns undefined for null/empty/array input', () => {
    expect(calcNutrientsFromFood(null, 100)).toBeUndefined();
    expect(calcNutrientsFromFood({}, 100)).toBeUndefined();
    expect(calcNutrientsFromFood([1, 2], 100)).toBeUndefined();
    expect(calcNutrientsFromFood({ junk: 'x' }, 100)).toBeUndefined();
  });
});
