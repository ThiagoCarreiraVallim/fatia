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
export class CreateWorkoutPlanTool implements McpToolDef {
  constructor(private readonly plans: WorkoutPlanService) {}

  readonly name = 'create_workout_plan';
  readonly description = 'Cria um novo plano de treino com nome.';
  readonly inputSchema = {
    name: z.string().min(1).max(100).describe('Nome do plano (ex: "Push", "Pull", "HIIT")'),
  } as const;

  execute(input: { name: string }, { userId }: McpToolContext) {
    return this.plans.create(userId, input);
  }
}
