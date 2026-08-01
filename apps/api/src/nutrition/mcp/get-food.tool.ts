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
export class GetFoodTool implements McpToolDef {
  constructor(private readonly foods: FoodService) {}
  readonly name = 'get_food';
  readonly title = 'Ver alimento';
  readonly annotations = { readOnlyHint: true, destructiveHint: false };
  readonly description = 'Detalhe de um alimento por id.';
  readonly inputSchema = {
    id: z.number().int().describe('ID do alimento no catálogo, obtido via search_food'),
  } as const;
  execute({ id }: { id: number }, { userId }: McpToolContext) {
    return this.foods.get(userId, id);
  }
}
