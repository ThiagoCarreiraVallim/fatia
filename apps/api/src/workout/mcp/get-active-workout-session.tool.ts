import { Injectable } from '@nestjs/common';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { WorkoutSessionService } from '../workout-session.service';

@Injectable()
@McpTool()
export class GetActiveWorkoutSessionTool implements McpToolDef {
  constructor(private readonly sessions: WorkoutSessionService) {}

  readonly name = 'get_active_workout_session';

  readonly title = 'Ver treino em andamento';

  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };

  readonly hostedInference = false;
  readonly description = 'Retorna a sessão de treino ativa (ainda não finalizada), se houver.';
  readonly inputSchema = {} as const;

  execute(_input: Record<string, never>, { userId }: McpToolContext) {
    return this.sessions.findActive(userId);
  }

  /** As séries do treino aberto. Sem treino aberto não há cartão. */
  artifact(result: unknown) {
    const sessao = result as Awaited<ReturnType<WorkoutSessionService['findActive']>>;
    if (!sessao) return null;
    return {
      kind: 'report',
      label: 'Treino em andamento',
      columns: ['Exercício', 'Série', 'Carga (kg)', 'Repetições'],
      rows: sessao.sets.map((serie) => [
        serie.exercise.name,
        serie.setNumber,
        serie.weightKg,
        serie.reps,
      ]),
    };
  }
}
