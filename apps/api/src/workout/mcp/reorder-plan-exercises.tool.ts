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
export class ReorderPlanExercisesTool implements McpToolDef {
  constructor(private readonly plans: WorkoutPlanService) {}

  readonly name = 'reorder_plan_exercises';
  readonly description =
    'Reordena os exercícios de um plano de treino. Envie a lista completa com as novas posições.';
  readonly inputSchema = {
    planId: z.string().uuid().describe('ID do plano de treino'),
    exercises: z
      .array(
        z.object({
          id: z.string().uuid().describe('ID da entrada do exercício no plano'),
          order: z.number().int().min(0).describe('Nova posição (0 = primeiro)'),
        }),
      )
      .min(1)
      .describe('Lista com o novo ordenamento'),
  } as const;

  execute(
    input: { planId: string; exercises: Array<{ id: string; order: number }> },
    { userId }: McpToolContext,
  ) {
    return this.plans.reorderExercises(userId, input.planId, { exercises: input.exercises });
  }
}
