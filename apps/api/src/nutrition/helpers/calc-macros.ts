export interface FoodMacros {
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

export interface ItemMacros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calcMacrosFromFood(food: FoodMacros, grams: number): ItemMacros {
  const ratio = grams / 100;
  return {
    kcal: round2(food.kcalPer100g * ratio),
    proteinG: round2(food.proteinPer100g * ratio),
    carbsG: round2(food.carbsPer100g * ratio),
    fatG: round2(food.fatPer100g * ratio),
  };
}

export function sumMacros(items: ItemMacros[]): ItemMacros {
  return items.reduce(
    (acc, it) => ({
      kcal: round2(acc.kcal + it.kcal),
      proteinG: round2(acc.proteinG + it.proteinG),
      carbsG: round2(acc.carbsG + it.carbsG),
      fatG: round2(acc.fatG + it.fatG),
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}
