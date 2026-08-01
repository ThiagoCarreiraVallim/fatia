import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealType } from '@prisma/client';
import { MealService } from '../meal.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

const itemSchema = z.object({
  foodId: z.number().int().optional(),
  foodName: z.string().optional(),
  grams: z.number().min(0.1),
  kcal: z.number().min(0).optional(),
  proteinG: z.number().min(0).optional(),
  carbsG: z.number().min(0).optional(),
  fatG: z.number().min(0).optional(),
  nutrients: z.record(z.number()).optional(),
  groupId: z.number().int().optional(),
});

@Injectable()
@McpTool()
export class LogMealTool implements McpToolDef {
  constructor(private readonly meals: MealService) {}
  readonly name = 'log_meal';
  readonly title = 'Registrar refeição';
  readonly annotations = { destructiveHint: false };
  readonly description =
    'Registra uma refeição com items. Cada item pode referenciar foodId (TACO/custom) ou ser livre (foodName + macros estimados).';
  readonly inputSchema = {
    mealType: z
      .nativeEnum(MealType)
      .describe('Tipo da refeição: BREAKFAST, LUNCH, DINNER ou SNACK'),
    eatenAt: z
      .string()
      .describe('Quando a refeição foi consumida, em ISO 8601 (ex.: 2026-07-29T12:30:00-03:00)'),
    notes: z.string().max(500).optional().describe('Observações livres sobre a refeição'),
    items: z
      .array(itemSchema)
      .min(1)
      .describe(
        'Itens da refeição — pelo menos um. Cada item: foodId do catálogo ou foodName + macros estimados',
      ),
  } as const;
  execute(
    input: {
      mealType: MealType;
      eatenAt: string;
      notes?: string;
      items: z.infer<typeof itemSchema>[];
    },
    { userId }: McpToolContext,
  ) {
    return this.meals.create(userId, input);
  }
}
