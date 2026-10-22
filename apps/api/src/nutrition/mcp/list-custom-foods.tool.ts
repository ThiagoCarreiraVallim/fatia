import { Injectable } from '@nestjs/common';
import { FoodService } from '../food.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class ListCustomFoodsTool implements McpToolDef {
  constructor(private readonly foods: FoodService) {}
  readonly name = 'list_custom_foods';
  readonly title = 'Meus alimentos cadastrados';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly description =
    'Alimentos que a pessoa cadastrou (create_custom_food), com valores por 100 g e medidas. ' +
    'Use para achar o id antes de update_custom_food ou delete_custom_food.';
  readonly inputSchema = {} as const;
  execute(_input: Record<string, never>, { userId }: McpToolContext) {
    return this.foods.listCustom(userId);
  }
}
