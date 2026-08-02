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
export class DeleteWorkoutPlanTool implements McpToolDef {
  constructor(private readonly plans: WorkoutPlanService) {}

  readonly name = 'delete_workout_plan';

  readonly title = 'Excluir plano de treino';

  readonly annotations = { readOnlyHint: false, destructiveHint: true };

  readonly hostedInference = false;
  readonly description =
    'Exclui um plano de treino e todos os seus exercícios vinculados. ' +
    'Exemplo: {"planId":"11111111-2222-4333-8444-555555555555"}';
  readonly inputSchema = {
    planId: z.string().uuid().describe('ID do plano a excluir'),
  } as const;

  async execute(input: { planId: string }, { userId }: McpToolContext) {
    await this.plans.delete(userId, input.planId);
    return { deleted: true };
  }
}
