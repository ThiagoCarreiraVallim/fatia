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

/**
 * Deriva os micronutrientes do item a partir do catálogo (Food.nutrients, por 100g)
 * pela mesma regra de 3 dos macros. Aceita o Json cru do Prisma; ignora valores não
 * numéricos. Retorna undefined se não houver nada utilizável (ADR 009).
 */
export function calcNutrientsFromFood(
  foodNutrients: unknown,
  grams: number,
): Record<string, number> | undefined {
  if (!foodNutrients || typeof foodNutrients !== 'object' || Array.isArray(foodNutrients)) {
    return undefined;
  }
  const ratio = grams / 100;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(foodNutrients as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = round2(value * ratio);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

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
