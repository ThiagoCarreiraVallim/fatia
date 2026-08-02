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
  // O contrato ("só os ids enviados") é o mesmo do JSDoc de
  // `workoutApi.reorderPlanExercises` e de `docs/MCP.md`. Antes esta descrição
  // pedia a lista completa, e o efeito era o Claude reescrever o `order` de
  // exercícios parados — apagando a troca que o app tinha acabado de gravar.
  readonly description =
    'Reordena os exercícios de um plano de treino. Envie apenas os exercícios que mudaram de posição: o `order` dos que não forem enviados fica como está. Devolve o plano completo já reordenado. ' +
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
      .describe('Somente os exercícios que mudaram de posição, com o novo `order` de cada um'),
  } as const;

  execute(
    input: { planId: string; exercises: Array<{ id: string; order: number }> },
    { userId }: McpToolContext,
  ) {
    return this.plans.reorderExercises(userId, input.planId, { exercises: input.exercises });
  }
}
