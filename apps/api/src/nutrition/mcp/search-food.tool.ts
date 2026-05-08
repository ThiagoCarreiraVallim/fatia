import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { FoodService } from '../food.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class SearchFoodTool implements McpToolDef {
  constructor(private readonly foods: FoodService) {}
  readonly name = 'search_food';
  readonly description = 'Busca alimentos no catálogo TACO + customs do usuário.';
  readonly inputSchema = {
    q: z.string().optional(),
    groupId: z.number().int().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  } as const;
  execute(params: { q?: string; groupId?: number; limit?: number }, { userId }: McpToolContext) {
    return this.foods.search(userId, params);
  }
}
