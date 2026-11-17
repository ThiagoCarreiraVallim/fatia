import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { WorkoutPlanService } from '../workout-plan.service';

/**
 * "Salvar como plano" (#381, prancha `Al-T11b`): a mesma rota do app
 * (`POST /workout/sessions/:id/plan`). Cria um plano novo, não mexe na sessão;
 * idempotente por sessão (`WorkoutPlan.fromSessionId`).
 */
@Injectable()
@McpTool()
export class SaveSessionAsPlanTool implements McpToolDef {
  constructor(private readonly plans: WorkoutPlanService) {}

  readonly name = 'save_session_as_plan';

  readonly title = 'Salvar treino como plano';

  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };

  readonly hostedInference = false;
  readonly description =
    'Cria um plano de treino novo a partir de uma sessão já feita (treino livre, inclusive o só ' +
    'de cardio): os exercícios na ordem da sessão, com as séries, a faixa de repetições e a carga ' +
    'da primeira série; no cardio, a distância e o tempo feitos viram a meta. Sem name, o plano ' +
    'leva o nome do plano da sessão, do único exercício ou "Treino livre". Só sessão terminada ' +
    '(a aberta dá conflito: finalize antes); salvar de novo a mesma sessão devolve o plano que ' +
    'ela já virou, sem criar outro. ' +
    'Exemplo: {"sessionId":"11111111-2222-4333-8444-555555555555","name":"Esteira 5 km"}';
  readonly inputSchema = {
    sessionId: z.string().uuid().describe('ID da sessão que vira plano'),
    name: z.string().max(100).optional().describe('Nome do plano novo'),
  } as const;

  execute(input: { sessionId: string; name?: string }, { userId }: McpToolContext) {
    return this.plans.createFromSession(userId, input.sessionId, { name: input.name });
  }
}
