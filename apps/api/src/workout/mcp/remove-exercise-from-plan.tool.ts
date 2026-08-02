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
export class RemoveExerciseFromPlanTool implements McpToolDef {
  constructor(private readonly plans: WorkoutPlanService) {}

  readonly name = 'remove_exercise_from_plan';

  readonly title = 'Remover exercício do plano';

  readonly annotations = { readOnlyHint: false, destructiveHint: true };
  readonly description =
    'Remove um exercício de um plano de treino. ' +
    'Exemplo: {"planId":"11111111-2222-4333-8444-555555555555","planExerciseId":"66666666-7777-4888-8999-aaaaaaaaaaaa"}';
  readonly inputSchema = {
    planId: z.string().uuid().describe('ID do plano de treino'),
    planExerciseId: z.string().uuid().describe('ID da entrada do exercício no plano'),
  } as const;

  async execute(input: { planId: string; planExerciseId: string }, { userId }: McpToolContext) {
    await this.plans.removeExercise(userId, input.planId, input.planExerciseId);
    return { removed: true };
  }
}
