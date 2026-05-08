import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealService } from '../meal.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class DeleteMealTool implements McpToolDef {
  constructor(private readonly meals: MealService) {}
  readonly name = 'delete_meal';
  readonly description = 'Remove uma refeição.';
  readonly inputSchema = { id: z.string().uuid() } as const;
  async execute({ id }: { id: string }, { userId }: McpToolContext) {
    await this.meals.delete(userId, id);
    return { deleted: id };
  }
}
