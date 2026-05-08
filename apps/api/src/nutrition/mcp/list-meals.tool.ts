import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealService } from '../meal.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class ListMealsTool implements McpToolDef {
  constructor(private readonly meals: MealService) {}
  readonly name = 'list_meals';
  readonly description = 'Lista refeições do usuário (cursor pagination).';
  readonly inputSchema = {
    date: z.string().optional().describe('YYYY-MM-DD para filtrar pelo dia'),
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  } as const;
  execute(input: { date?: string; cursor?: string; limit?: number }, { userId }: McpToolContext) {
    return this.meals.list(userId, input);
  }
}
