import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { FoodService } from '../food.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class UpdateCustomFoodTool implements McpToolDef {
  constructor(private readonly foods: FoodService) {}
  readonly name = 'update_custom_food';
  readonly description = 'Atualiza um alimento custom do usuário.';
  readonly inputSchema = {
    id: z.number().int(),
    name: z.string().min(1).max(160).optional(),
    groupId: z.number().int().optional(),
    kcalPer100g: z.number().min(0).optional(),
    proteinPer100g: z.number().min(0).optional(),
    carbsPer100g: z.number().min(0).optional(),
    fatPer100g: z.number().min(0).optional(),
  } as const;
  execute({ id, ...rest }: { id: number } & Record<string, unknown>, { userId }: McpToolContext) {
    return this.foods.updateCustom(userId, id, rest);
  }
}
