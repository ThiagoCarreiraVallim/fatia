import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { MAX_TEMPLATE_ITEMS, MAX_TEMPLATE_NAME } from '../nutrition/dto/meal-template.dto';
import { describeIssues } from './plan-snapshot';

/**
 * Formato congelado de um plano de nutrição da comunidade (Fase 7): metas de
 * calorias e macros e refeições sugeridas. Mesmo princípio do treino
 * (`plan-snapshot.ts`): o retrato viaja por valor e a adoção cria dado de quem
 * adota, sem vínculo com o autor.
 *
 * Os itens têm o formato de `MealTemplateItem` — a refeição sugerida vira uma
 * refeição salva da pessoa. `foodId` só sobrevive se o alimento for do
 * catálogo público: alimento personalizado do autor é dele, e o item viaja só
 * com nome e números.
 */
export const NUTRITION_SNAPSHOT_VERSION = 1;
export const MAX_SUGGESTED_MEALS = 8;

/** Teto de domínio, o mesmo para kcal e gramas: nada real passa disso. */
const TETO = 100_000;
const meta = z.number().int().min(0).max(TETO);

export const nutritionGoalsSchema = z
  .object({
    kcalMin: meta,
    kcalMax: meta,
    proteinMinG: meta,
    proteinMaxG: meta,
    carbsMinG: meta,
    carbsMaxG: meta,
    fatMinG: meta,
    fatMaxG: meta,
  })
  .superRefine((g, ctx) => {
    for (const [min, max] of [
      ['kcalMin', 'kcalMax'],
      ['proteinMinG', 'proteinMaxG'],
      ['carbsMinG', 'carbsMaxG'],
      ['fatMinG', 'fatMaxG'],
    ] as const) {
      if (g[min] > g[max]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [min],
          message: 'mínimo acima do máximo',
        });
      }
    }
  });

export type NutritionGoals = z.infer<typeof nutritionGoalsSchema>;

const numero = z.number().min(0).max(TETO);

const itemSchema = z.object({
  foodId: z.number().int().positive().nullable(),
  groupId: z.number().int().positive().nullable(),
  foodName: z.string().min(1).max(200),
  grams: z.number().positive().max(TETO),
  kcal: numero,
  proteinG: numero,
  carbsG: numero,
  fatG: numero,
  nutrients: z.record(z.string().max(40), z.number().min(0).max(TETO)).nullable(),
  portionLabel: z.string().max(80).nullable(),
  portionQuantity: z.number().positive().max(TETO).nullable(),
});

export type SuggestedMealItem = z.infer<typeof itemSchema>;

const mealSchema = z.object({
  name: z.string().min(1).max(MAX_TEMPLATE_NAME),
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']).nullable(),
  items: z.array(itemSchema).min(1).max(MAX_TEMPLATE_ITEMS),
});

export type SuggestedMeal = z.infer<typeof mealSchema>;

export const nutritionSnapshotSchema = z
  .object({
    version: z.literal(NUTRITION_SNAPSHOT_VERSION),
    goals: nutritionGoalsSchema.nullable(),
    meals: z.array(mealSchema).max(MAX_SUGGESTED_MEALS),
  })
  .refine((s) => s.goals !== null || s.meals.length > 0, {
    message: 'o plano precisa de metas ou de ao menos uma refeição',
  });

export type NutritionSnapshot = z.infer<typeof nutritionSnapshotSchema>;

/**
 * Valida o retrato. `onPublish` decide de quem é o erro: na publicação é do
 * autor, que tem o plano na frente; na adoção, o retrato veio do banco e a
 * mensagem diz que nada foi criado.
 */
export function parseNutritionSnapshot(raw: unknown, onPublish: boolean): NutritionSnapshot {
  const parsed = nutritionSnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestException(
      onPublish
        ? `Este plano não pode ser publicado (${describeIssues(parsed.error)}).`
        : `Plano de nutrição inválido (${describeIssues(parsed.error)}). Nada foi criado.`,
    );
  }
  return parsed.data;
}
