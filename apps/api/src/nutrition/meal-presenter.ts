import { MealItemSource } from '@prisma/client';

/**
 * De onde veio a refeição, pela origem dos itens (#374). Basta um item da IA
 * para a refeição ser "da IA": é o selo que avisa que a porção é estimativa.
 */
export function mealOrigin(items: ReadonlyArray<{ source?: MealItemSource }> = []): MealItemSource {
  for (const source of [MealItemSource.AI, MealItemSource.PLAN, MealItemSource.BARCODE]) {
    // `Array.isArray`: os duplos dos testes devolvem o `data` do create, onde os itens são `{ create }`.
    if (Array.isArray(items) && items.some((item) => item.source === source)) return source;
  }
  return MealItemSource.MANUAL;
}

export type PresentedMeal<M> = Omit<M, 'photoFileId'> & {
  hasPhoto: boolean;
  origin: MealItemSource;
};

/**
 * A refeição como sai da API e das tools: diz se há foto, nunca qual arquivo
 * (ADR 038, item 7). A URL da foto só sai na leitura de uma refeição, assinada.
 */
export function presentMeal<
  M extends { photoFileId?: string | null; items?: ReadonlyArray<{ source?: MealItemSource }> },
>(meal: M): PresentedMeal<M> {
  const { photoFileId, ...rest } = meal;
  return { ...rest, hasPhoto: photoFileId != null, origin: mealOrigin(meal.items) };
}
