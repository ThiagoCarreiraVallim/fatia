import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { UserGoalsService } from '../user-goals.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class SetNutritionGoalsTool implements McpToolDef {
  constructor(private readonly goals: UserGoalsService) {}
  readonly name = 'set_nutrition_goals';
  readonly description = 'Cria/atualiza as metas nutricionais do usuário.';
  readonly inputSchema = {
    kcalMin: z.number().int().min(0),
    kcalMax: z.number().int().min(0),
    proteinMinG: z.number().int().min(0),
    proteinMaxG: z.number().int().min(0),
    carbsMinG: z.number().int().min(0),
    carbsMaxG: z.number().int().min(0),
    fatMinG: z.number().int().min(0),
    fatMaxG: z.number().int().min(0),
    weeklyWorkouts: z.number().int().min(0).optional(),
    dailyStepsTarget: z.number().int().min(0).optional(),
  } as const;
  execute(
    input: {
      kcalMin: number;
      kcalMax: number;
      proteinMinG: number;
      proteinMaxG: number;
      carbsMinG: number;
      carbsMaxG: number;
      fatMinG: number;
      fatMaxG: number;
      weeklyWorkouts?: number;
      dailyStepsTarget?: number;
    },
    { userId }: McpToolContext,
  ) {
    return this.goals.upsert(userId, input);
  }
}
