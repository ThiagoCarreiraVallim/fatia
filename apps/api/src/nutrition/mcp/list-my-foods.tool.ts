import { Injectable } from '@nestjs/common';
import { MealType } from '@prisma/client';
import { z } from 'zod';
import { FoodShortcutsService } from '../food-shortcuts.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class ListMyFoodsTool implements McpToolDef {
  constructor(private readonly shortcuts: FoodShortcutsService) {}
  readonly name = 'list_my_foods';
  readonly title = 'Alimentos favoritos e recentes';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly description =
    'Favoritos e alimentos comidos nos últimos 60 dias, com a última gramagem (lastGrams). ' +
    'Consulte antes de search_food: o que a pessoa costuma comer já vem com id e porção.';
  readonly inputSchema = {
    mealType: z
      .nativeEnum(MealType)
      .optional()
      .describe('Refeição sendo registrada: o que costuma ir nela vem primeiro'),
    limit: z.number().int().min(1).max(30).optional().describe('Máximo de recentes (padrão 10)'),
  } as const;
  execute(input: { mealType?: MealType; limit?: number }, { userId }: McpToolContext) {
    return this.shortcuts.list(userId, input);
  }
}
