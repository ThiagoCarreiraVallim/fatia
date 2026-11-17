import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealService } from '../meal.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

/**
 * "Apagar só a foto" (#374, ADR 038): o arquivo some do bucket e a refeição
 * fica com os números. Não há tool que leia a foto (ADR 038, item 7).
 */
@Injectable()
@McpTool()
export class DeleteMealPhotoTool implements McpToolDef {
  constructor(private readonly meals: MealService) {}
  readonly name = 'delete_meal_photo';
  readonly title = 'Apagar a foto da refeição';
  readonly annotations = { readOnlyHint: false, destructiveHint: true, confirmableHint: false };
  readonly hostedInference = false;
  readonly appOnly = { screen: 'Ações da refeição', path: '/nutrition/meals/:id' };
  readonly description =
    'Apaga só a foto guardada de uma refeição (a que tem hasPhoto: true); a refeição e os itens ficam. ' +
    'Não tem volta. Exemplo: {"id":"11111111-2222-4333-8444-555555555555"}';
  readonly inputSchema = {
    id: z.string().uuid().describe('ID da refeição cuja foto será apagada'),
  } as const;
  async execute({ id }: { id: string }, { userId }: McpToolContext) {
    const meal = await this.meals.deletePhoto(userId, id);
    return { mealId: meal.id, hasPhoto: meal.hasPhoto };
  }
}
