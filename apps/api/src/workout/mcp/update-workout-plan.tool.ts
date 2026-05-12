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
export class UpdateWorkoutPlanTool implements McpToolDef {
  constructor(private readonly plans: WorkoutPlanService) {}

  readonly name = 'update_workout_plan';
  readonly description = 'Atualiza o nome de um plano de treino.';
  readonly inputSchema = {
    planId: z.string().uuid().describe('ID do plano'),
    name: z.string().min(1).max(100).describe('Novo nome do plano'),
  } as const;

  execute(input: { planId: string; name: string }, { userId }: McpToolContext) {
    return this.plans.update(userId, input.planId, { name: input.name });
  }
}
