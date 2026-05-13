import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { WorkoutPlanService } from '../workout-plan.service';

@Injectable()
@McpTool()
export class AddExerciseToPlanTool implements McpToolDef {
  constructor(private readonly plans: WorkoutPlanService) {}

  readonly name = 'add_exercise_to_plan';
  readonly description =
    'Adiciona um exercício a um plano de treino, com séries e reps alvo opcionais.';
  readonly inputSchema = {
    planId: z.string().uuid().describe('ID do plano de treino'),
    exerciseId: z.number().int().positive().describe('ID do exercício'),
    order: z.number().int().min(1).describe('Posição na lista (1 = primeiro)'),
    targetSets: z.number().int().min(1).max(20).describe('Número de séries alvo'),
    targetReps: z.string().max(20).describe('Repetições alvo (ex: "8-12", "5", "AMRAP", "30s")'),
  } as const;

  execute(
    input: {
      planId: string;
      exerciseId: number;
      order: number;
      targetSets: number;
      targetReps: string;
    },
    { userId }: McpToolContext,
  ) {
    const { planId, ...dto } = input;
    return this.plans.addExercise(userId, planId, dto);
  }
}
