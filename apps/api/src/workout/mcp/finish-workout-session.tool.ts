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
  readonly description =
    'Finaliza uma sessão de treino em andamento, registrando o horário de conclusão.';
  readonly inputSchema = {
    sessionId: z.string().uuid().describe('ID da sessão a finalizar'),
    notes: z.string().max(500).optional().describe('Notas finais do treino'),
  } as const;

  execute(input: { sessionId: string; notes?: string }, { userId }: McpToolContext) {
    return this.sessions.finish(userId, input.sessionId, { notes: input.notes });
  }
}
