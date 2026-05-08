import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { FoodService } from '../food.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class DeleteCustomFoodTool implements McpToolDef {
  constructor(private readonly foods: FoodService) {}
  readonly name = 'delete_custom_food';
  readonly description = 'Remove um alimento custom do usuário.';
  readonly inputSchema = { id: z.number().int() } as const;
  async execute({ id }: { id: number }, { userId }: McpToolContext) {
    await this.foods.deleteCustom(userId, id);
    return { deleted: id };
  }
}
