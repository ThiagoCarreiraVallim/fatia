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
export class UpdateMealItemTool implements McpToolDef {
  constructor(private readonly mealItems: MealItemService) {}
  readonly name = 'update_meal_item';
  readonly description = 'Atualiza gramas ou macros de um item.';
  readonly inputSchema = {
    id: z.string().uuid(),
    grams: z.number().min(0.1).optional(),
    kcal: z.number().min(0).optional(),
    proteinG: z.number().min(0).optional(),
    carbsG: z.number().min(0).optional(),
    fatG: z.number().min(0).optional(),
  } as const;
  execute({ id, ...rest }: { id: string } & Record<string, unknown>, { userId }: McpToolContext) {
    return this.mealItems.update(userId, id, rest);
  }
}
