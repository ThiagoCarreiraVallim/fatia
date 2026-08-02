import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealService } from '../meal.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class DeleteMealTool implements McpToolDef {
  constructor(private readonly meals: MealService) {}
  readonly name = 'delete_meal';
  readonly title = 'Excluir refeição';
  readonly annotations = { readOnlyHint: false, destructiveHint: true };
  readonly hostedInference = false;
  readonly description =
    'Remove uma refeição. ' + 'Exemplo: {"id":"11111111-2222-4333-8444-555555555555"}';
  readonly inputSchema = {
    id: z.string().uuid().describe('ID da refeição a remover — apaga os itens em cascata'),
  } as const;
  async execute({ id }: { id: string }, { userId }: McpToolContext) {
    await this.meals.delete(userId, id);
    return { deleted: id };
  }
}
