import { calcMacrosFromFood, sumMacros } from './calc-macros';

describe('calcMacrosFromFood', () => {
  const food = { kcalPer100g: 200, proteinPer100g: 10, carbsPer100g: 30, fatPer100g: 5 };

  it('escala por grama (100g = base)', () => {
    expect(calcMacrosFromFood(food, 100)).toEqual({
      kcal: 200,
      proteinG: 10,
      carbsG: 30,
      fatG: 5,
    });
  });

  it('escala por grama (50g = metade)', () => {
    expect(calcMacrosFromFood(food, 50)).toEqual({
      kcal: 100,
      proteinG: 5,
      carbsG: 15,
      fatG: 2.5,
    });
  });

  it('retorna zeros para 0g', () => {
    expect(calcMacrosFromFood(food, 0)).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });

  it('arredonda para 2 casas decimais', () => {
    const f = { kcalPer100g: 1, proteinPer100g: 1, carbsPer100g: 1, fatPer100g: 1 };
    expect(calcMacrosFromFood(f, 33.333)).toEqual({
      kcal: 0.33,
      proteinG: 0.33,
      carbsG: 0.33,
      fatG: 0.33,
    });
  });
});

describe('sumMacros', () => {
  it('soma vários items', () => {
    const items = [
      { kcal: 100, proteinG: 10, carbsG: 20, fatG: 5 },
      { kcal: 50, proteinG: 4, carbsG: 8, fatG: 2 },
    ];
    expect(sumMacros(items)).toEqual({ kcal: 150, proteinG: 14, carbsG: 28, fatG: 7 });
  });

  it('lista vazia → tudo zero', () => {
    expect(sumMacros([])).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });
});
