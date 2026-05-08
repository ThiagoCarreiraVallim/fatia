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
export class DeleteMealItemTool implements McpToolDef {
  constructor(private readonly mealItems: MealItemService) {}
  readonly name = 'delete_meal_item';
  readonly description = 'Remove um item de refeição.';
  readonly inputSchema = { id: z.string().uuid() } as const;
  async execute({ id }: { id: string }, { userId }: McpToolContext) {
    await this.mealItems.delete(userId, id);
    return { deleted: id };
  }
}
