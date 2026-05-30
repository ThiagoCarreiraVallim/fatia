import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealItemService } from '../meal-item.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class AddMealItemTool implements McpToolDef {
  constructor(private readonly mealItems: MealItemService) {}
  readonly name = 'add_meal_item';
  readonly description =
    'Adiciona um item a uma refeição existente. `nutrients` aceita micronutrientes opcionais por chave (ex.: { "sodium_mg": 412, "sugar_g": 9 }) para metas personalizadas.';
  readonly inputSchema = {
    mealId: z.string().uuid(),
    foodId: z.number().int().optional(),
    foodName: z.string().optional(),
    grams: z.number().min(0.1),
    kcal: z.number().min(0).optional(),
    proteinG: z.number().min(0).optional(),
    carbsG: z.number().min(0).optional(),
    fatG: z.number().min(0).optional(),
    nutrients: z.record(z.number()).optional(),
    groupId: z.number().int().optional(),
  } as const;
  execute(
    { mealId, ...item }: { mealId: string; grams: number } & Record<string, unknown>,
    { userId }: McpToolContext,
  ) {
    return this.mealItems.add(userId, mealId, item as never);
  }
}
