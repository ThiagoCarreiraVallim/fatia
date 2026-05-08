import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealType } from '@prisma/client';
import { MealService } from '../meal.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class UpdateMealTool implements McpToolDef {
  constructor(private readonly meals: MealService) {}
  readonly name = 'update_meal';
  readonly description = 'Atualiza metadados da refeição (mealType/eatenAt/notes).';
  readonly inputSchema = {
    id: z.string().uuid(),
    mealType: z.nativeEnum(MealType).optional(),
    eatenAt: z.string().optional(),
    notes: z.string().max(500).optional(),
  } as const;
  execute({ id, ...rest }: { id: string } & Record<string, unknown>, { userId }: McpToolContext) {
    return this.meals.update(userId, id, rest);
  }
}
