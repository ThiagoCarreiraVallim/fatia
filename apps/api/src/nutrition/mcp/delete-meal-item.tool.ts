import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealItemService } from '../meal-item.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class DeleteMealItemTool implements McpToolDef {
  constructor(private readonly mealItems: MealItemService) {}
  readonly name = 'delete_meal_item';
  readonly title = 'Excluir item da refeição';
  readonly annotations = { readOnlyHint: false, destructiveHint: true };
  readonly hostedInference = false;
  readonly description =
    'Remove um item de refeição. ' + 'Exemplo: {"id":"11111111-2222-4333-8444-555555555555"}';
  readonly inputSchema = {
    id: z.string().uuid().describe('ID do item de refeição a remover'),
  } as const;
  async execute({ id }: { id: string }, { userId }: McpToolContext) {
    await this.mealItems.delete(userId, id);
    return { deleted: id };
  }
}
