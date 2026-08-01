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
  readonly title = 'Buscar alimento';
  readonly annotations = { readOnlyHint: true, destructiveHint: false };
  readonly description = 'Busca alimentos no catálogo TACO + customs do usuário.';
  readonly inputSchema = {
    q: z
      .string()
      .optional()
      .describe('Termo de busca pelo nome do alimento (ex.: "arroz integral"). Omita para listar'),
    groupId: z
      .number()
      .int()
      .optional()
      .describe('Filtra por grupo alimentar. Use list_food_groups para obter os IDs'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Quantos resultados retornar (default 20, máx 50)'),
  } as const;
  execute(params: { q?: string; groupId?: number; limit?: number }, { userId }: McpToolContext) {
    return this.foods.search(userId, params);
  }
}
