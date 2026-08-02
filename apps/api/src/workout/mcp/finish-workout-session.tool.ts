import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { WorkoutSessionService } from '../workout-session.service';

@Injectable()
@McpTool()
export class FinishWorkoutSessionTool implements McpToolDef {
  constructor(private readonly sessions: WorkoutSessionService) {}

  readonly name = 'finish_workout_session';

  readonly title = 'Finalizar treino';

  readonly annotations = { readOnlyHint: false, destructiveHint: false };

  readonly hostedInference = false;
  readonly description =
    'Finaliza uma sessão de treino, registrando o horário de conclusão. ' +
    'Para treino já ocorrido (ex.: "ontem eu treinei"), informe completedAt — ' +
    'sem ele o fim é agora, e a sessão fica com a duração errada. ' +
    'Exemplo: {"sessionId":"11111111-2222-4333-8444-555555555555","completedAt":"2026-07-31T20:15:00-03:00","notes":"treino completo"}';
  readonly inputSchema = {
    sessionId: z.string().uuid().describe('ID da sessão a finalizar'),
    notes: z.string().max(500).optional().describe('Notas finais do treino'),
    completedAt: z
      .string()
      .optional()
      .describe(
        'Quando o treino terminou, em ISO 8601 (ex.: 2026-07-31T20:15:00-03:00). ' +
          'Default: agora. Precisa ser depois do início e não pode estar no futuro.',
      ),
  } as const;

  execute(
    input: { sessionId: string; notes?: string; completedAt?: string },
    { userId }: McpToolContext,
  ) {
    return this.sessions.finish(userId, input.sessionId, {
      notes: input.notes,
      completedAt: input.completedAt,
    });
  }
}
