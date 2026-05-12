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
export class GetWorkoutSessionTool implements McpToolDef {
  constructor(private readonly sessions: WorkoutSessionService) {}

  readonly name = 'get_workout_session';
  readonly description =
    'Retorna detalhes de uma sessão de treino com todas as séries registradas.';
  readonly inputSchema = {
    sessionId: z.string().uuid().describe('ID da sessão'),
  } as const;

  execute(input: { sessionId: string }, { userId }: McpToolContext) {
    return this.sessions.findById(userId, input.sessionId);
  }
}
