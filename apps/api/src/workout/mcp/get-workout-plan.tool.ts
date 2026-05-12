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
export class GetWorkoutPlanTool implements McpToolDef {
  constructor(private readonly plans: WorkoutPlanService) {}

  readonly name = 'get_workout_plan';
  readonly description = 'Retorna detalhes de um plano de treino (exercícios, séries e reps alvo).';
  readonly inputSchema = {
    planId: z.string().uuid().describe('ID do plano'),
  } as const;

  execute(input: { planId: string }, { userId }: McpToolContext) {
    return this.plans.findById(userId, input.planId);
  }
}
