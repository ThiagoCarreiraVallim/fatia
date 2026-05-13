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
export class UpdatePlanExerciseTool implements McpToolDef {
  constructor(private readonly plans: WorkoutPlanService) {}

  readonly name = 'update_plan_exercise';
  readonly description =
    'Atualiza séries, reps ou notas de um exercício dentro de um plano de treino.';
  readonly inputSchema = {
    planId: z.string().uuid().describe('ID do plano de treino'),
    planExerciseId: z.string().uuid().describe('ID da entrada do exercício no plano'),
    order: z.number().int().min(1).optional().describe('Nova posição'),
    targetSets: z.number().int().min(1).max(20).optional().describe('Novo número de séries alvo'),
    targetReps: z.string().max(20).optional().describe('Novas repetições alvo (ex: "8-12", "5")'),
  } as const;

  execute(
    input: {
      planId: string;
      planExerciseId: string;
      order?: number;
      targetSets?: number;
      targetReps?: string;
    },
    { userId }: McpToolContext,
  ) {
    const { planId, planExerciseId, ...dto } = input;
    return this.plans.updatePlanExercise(userId, planId, planExerciseId, dto);
  }
}
