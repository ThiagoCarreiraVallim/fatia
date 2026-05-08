import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealService } from '../meal.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class GetMealTool implements McpToolDef {
  constructor(private readonly meals: MealService) {}
  readonly name = 'get_meal';
  readonly description = 'Detalha uma refeição.';
  readonly inputSchema = { id: z.string().uuid() } as const;
  execute({ id }: { id: string }, { userId }: McpToolContext) {
    return this.meals.findById(userId, id);
  }
}
