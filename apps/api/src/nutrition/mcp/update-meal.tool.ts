import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealType } from '@prisma/client';
import { MealService } from '../meal.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class UpdateMealTool implements McpToolDef {
  constructor(private readonly meals: MealService) {}
  readonly name = 'update_meal';
  readonly title = 'Atualizar refeição';
  readonly annotations = { destructiveHint: false };
  readonly description = 'Atualiza metadados da refeição (mealType/eatenAt/notes).';
  readonly inputSchema = {
    id: z.string().uuid().describe('ID da refeição a atualizar'),
    mealType: z
      .nativeEnum(MealType)
      .optional()
      .describe('Novo tipo: BREAKFAST, LUNCH, DINNER ou SNACK'),
    eatenAt: z.string().optional().describe('Novo horário de consumo, em ISO 8601'),
    notes: z.string().max(500).optional().describe('Novas observações da refeição'),
  } as const;
  execute({ id, ...rest }: { id: string } & Record<string, unknown>, { userId }: McpToolContext) {
    return this.meals.update(userId, id, rest);
  }
}
