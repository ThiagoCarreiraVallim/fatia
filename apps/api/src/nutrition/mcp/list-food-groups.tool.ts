import { Injectable } from '@nestjs/common';
import { FoodService } from '../food.service';
import { McpTool, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class ListFoodGroupsTool implements McpToolDef {
  constructor(private readonly foods: FoodService) {}
  readonly name = 'list_food_groups';
  readonly description = 'Lista todos os grupos de alimentos.';
  readonly inputSchema = {} as const;
  execute() {
    return this.foods.listGroups();
  }
}
