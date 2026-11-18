import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { WorkoutPlanService } from '../workout-plan.service';
import {
  planExerciseConfigShape,
  type PlanExerciseConfigInput,
} from './plan-exercise-config.schema';

@Injectable()
@McpTool()
export class AddExerciseToPlanTool implements McpToolDef {
  constructor(private readonly plans: WorkoutPlanService) {}

  readonly name = 'add_exercise_to_plan';

  readonly title = 'Adicionar exercício ao plano';

  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };

  readonly hostedInference = false;

  readonly card = 'confirm' as const;
  readonly aiCategory = 'WORKOUT' as const;
  readonly description =
    'Adiciona um exercício a um plano de treino, com séries, reps, descanso, técnica, carga inicial ' +
    'e, no cardio, meta por tempo ou distância. Exercício que já está no plano responde CONFLICT. ' +
    'Exemplo: {"planId":"11111111-2222-4333-8444-555555555555","exerciseId":42,"targetSets":4,"targetReps":"8-12","restSeconds":90}';
  readonly inputSchema = {
    planId: z.string().uuid().describe('ID do plano de treino'),
    exerciseId: z.number().int().positive().describe('ID do exercício'),
    order: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Posição na lista (1 = primeiro). Sem ela, entra no fim'),
    targetSets: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Número de séries alvo (padrão 3; 1 no cardio)'),
    targetReps: z
      .string()
      .max(20)
      .optional()
      .describe('Repetições alvo (ex: "8-12", "5", "AMRAP", "30s"); mínimo ≤ máximo'),
    ...planExerciseConfigShape,
  } as const;

  execute(
    input: {
      planId: string;
      exerciseId: number;
      order?: number;
      targetSets?: number;
      targetReps?: string;
    } & PlanExerciseConfigInput,
    { userId }: McpToolContext,
  ) {
    const { planId, ...dto } = input;
    return this.plans.addExercise(userId, planId, dto);
  }
}
