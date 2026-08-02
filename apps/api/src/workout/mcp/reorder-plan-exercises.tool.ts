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

  readonly title = 'Reordenar exercícios do plano';

  readonly annotations = { readOnlyHint: false, destructiveHint: false };
  readonly description =
    'Reordena os exercícios de um plano de treino. Envie a lista completa com as novas posições. ' +
    'Exemplo: {"planId":"11111111-2222-4333-8444-555555555555","exercises":[{"id":"66666666-7777-4888-8999-aaaaaaaaaaaa","order":0},{"id":"bbbbbbbb-cccc-4ddd-8eee-ffffffffffff","order":1}]}';
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
