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
export class StartWorkoutSessionTool implements McpToolDef {
  constructor(private readonly sessions: WorkoutSessionService) {}

  readonly name = 'start_workout_session';

  readonly title = 'Iniciar treino';

  readonly annotations = { readOnlyHint: false, destructiveHint: false };
  readonly description =
    'Inicia uma sessão de treino (livre ou vinculada a um plano). ' +
    'Exemplo: {"planId":"11111111-2222-4333-8444-555555555555","startedAt":"2026-07-31T19:00:00-03:00"}';
  readonly inputSchema = {
    planId: z.string().uuid().optional().describe('ID do plano a seguir (opcional)'),
    startedAt: z.string().optional().describe('ISO8601 do início (padrão: agora)'),
    notes: z.string().max(500).optional().describe('Notas iniciais'),
  } as const;

  execute(
    input: { planId?: string; startedAt?: string; notes?: string },
    { userId }: McpToolContext,
  ) {
    return this.sessions.start(userId, input);
  }
}
