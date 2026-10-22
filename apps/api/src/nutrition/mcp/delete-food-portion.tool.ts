import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { FoodPortionService } from '../food-portion.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class DeleteFoodPortionTool implements McpToolDef {
  constructor(private readonly portions: FoodPortionService) {}
  readonly name = 'delete_food_portion';
  readonly title = 'Excluir medida caseira';
  readonly annotations = { readOnlyHint: false, destructiveHint: true, confirmableHint: false };
  readonly hostedInference = false;
  readonly description =
    'Remove uma medida caseira criada pelo usuário; as do catálogo não saem. ' +
    'Exemplo: {"id":"11111111-2222-4333-8444-555555555555"}';
  readonly inputSchema = {
    id: z.string().uuid().describe('ID da medida (mine: true em get_food)'),
  } as const;
  async execute({ id }: { id: string }, { userId }: McpToolContext) {
    await this.portions.remove(userId, id);
    return { deleted: id };
  }
}
