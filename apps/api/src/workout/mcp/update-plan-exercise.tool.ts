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
  planSetsSchema,
  type PlanExerciseConfigInput,
} from './plan-exercise-config.schema';

@Injectable()
@McpTool()
export class UpdatePlanExerciseTool implements McpToolDef {
  constructor(private readonly plans: WorkoutPlanService) {}

  readonly name = 'update_plan_exercise';

  readonly title = 'Atualizar exercício do plano';

  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };

  readonly hostedInference = false;

  readonly card = 'confirm' as const;
  readonly aiCategory = 'WORKOUT' as const;
  readonly description =
    'Atualiza um exercício dentro do plano: séries, reps, descanso, técnica, carga inicial, ' +
    'meta de cardio ou a série por série. A linha é a do planExerciseId. Exemplo: {"planId":"11111111-2222-4333-8444-555555555555","planExerciseId":"66666666-7777-4888-8999-aaaaaaaaaaaa","targetReps":"6-8","restSeconds":120}';
  readonly inputSchema = {
    planId: z.string().uuid().describe('ID do plano de treino'),
    planExerciseId: z.string().uuid().describe('ID da entrada do exercício no plano'),
    order: z.number().int().min(0).optional().describe('Nova posição'),
    targetSets: z.number().int().min(1).max(20).optional().describe('Novo número de séries alvo'),
    targetReps: z
      .string()
      .max(20)
      .optional()
      .describe('Novas repetições alvo (ex: "8-12", "5"); mínimo ≤ máximo'),
    ...planExerciseConfigShape,
    sets: planSetsSchema
      .nullable()
      .optional()
      .describe(
        'Série por série, na ordem (substitui a tabela; séries e faixa saem dela). [] ou null volta a séries iguais',
      ),
  } as const;

  execute(
    input: {
      planId: string;
      planExerciseId: string;
      order?: number;
      targetSets?: number;
      targetReps?: string;
      sets?: z.infer<typeof planSetsSchema> | null;
    } & PlanExerciseConfigInput,
    { userId }: McpToolContext,
  ) {
    const { planId, planExerciseId, ...dto } = input;
    return this.plans.updatePlanExercise(userId, planId, planExerciseId, dto);
  }
}
