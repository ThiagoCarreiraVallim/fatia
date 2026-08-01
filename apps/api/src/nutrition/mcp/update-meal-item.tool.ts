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
export class UpdateMealItemTool implements McpToolDef {
  constructor(private readonly mealItems: MealItemService) {}
  readonly name = 'update_meal_item';
  readonly title = 'Atualizar item da refeição';
  readonly annotations = { readOnlyHint: false, destructiveHint: false };
  readonly description = 'Atualiza gramas ou macros de um item.';
  readonly inputSchema = {
    id: z.string().uuid().describe('ID do item de refeição a atualizar'),
    grams: z.number().min(0.1).optional().describe('Nova quantidade em gramas'),
    kcal: z.number().min(0).optional().describe('Novas calorias do item'),
    proteinG: z.number().min(0).optional().describe('Nova proteína em gramas'),
    carbsG: z.number().min(0).optional().describe('Novos carboidratos em gramas'),
    fatG: z.number().min(0).optional().describe('Nova gordura em gramas'),
  } as const;
  execute({ id, ...rest }: { id: string } & Record<string, unknown>, { userId }: McpToolContext) {
    return this.mealItems.update(userId, id, rest);
  }
}
