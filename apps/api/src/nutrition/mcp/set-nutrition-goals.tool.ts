import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { UserGoalsService } from '../user-goals.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class SetNutritionGoalsTool implements McpToolDef {
  constructor(private readonly goals: UserGoalsService) {}
  readonly name = 'set_nutrition_goals';
  readonly title = 'Definir metas nutricionais';
  readonly annotations = { readOnlyHint: false, destructiveHint: false };
  readonly hostedInference = false;
  readonly description =
    'Cria/atualiza as metas nutricionais do usuário. ' +
    'Exemplo: {"kcalMin":2100,"kcalMax":2400,"proteinMinG":140,"proteinMaxG":180,"carbsMinG":220,"carbsMaxG":280,"fatMinG":60,"fatMaxG":80}';
  readonly inputSchema = {
    kcalMin: z.number().int().min(0).describe('Piso da faixa diária de calorias'),
    kcalMax: z.number().int().min(0).describe('Teto da faixa diária de calorias'),
    proteinMinG: z.number().int().min(0).describe('Piso da faixa diária de proteína, em gramas'),
    proteinMaxG: z.number().int().min(0).describe('Teto da faixa diária de proteína, em gramas'),
    carbsMinG: z.number().int().min(0).describe('Piso da faixa diária de carboidratos, em gramas'),
    carbsMaxG: z.number().int().min(0).describe('Teto da faixa diária de carboidratos, em gramas'),
    fatMinG: z.number().int().min(0).describe('Piso da faixa diária de gordura, em gramas'),
    fatMaxG: z.number().int().min(0).describe('Teto da faixa diária de gordura, em gramas'),
    weeklyWorkouts: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Meta de treinos por semana (default 3)'),
    dailyStepsTarget: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Meta diária de passos (default 8000)'),
    dailyWaterTargetMl: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Meta diária de hidratação em mL (default 2500)'),
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
      dailyWaterTargetMl?: number;
    },
    { userId }: McpToolContext,
  ) {
    return this.goals.upsert(userId, input);
  }
}
