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
  groupId: z.number().int().optional(),
});

@Injectable()
@McpTool()
export class LogMealTool implements McpToolDef {
  constructor(private readonly meals: MealService) {}
  readonly name = 'log_meal';
  readonly description =
    'Registra uma refeição com items. Cada item pode referenciar foodId (TACO/custom) ou ser livre (foodName + macros estimados).';
  readonly inputSchema = {
    mealType: z.nativeEnum(MealType),
    eatenAt: z.string().describe('ISO 8601 datetime'),
    notes: z.string().max(500).optional(),
    items: z.array(itemSchema).min(1),
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
