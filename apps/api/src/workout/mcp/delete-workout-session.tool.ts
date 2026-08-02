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
export class DeleteWorkoutSessionTool implements McpToolDef {
  constructor(private readonly sessions: WorkoutSessionService) {}

  readonly name = 'delete_workout_session';

  readonly title = 'Excluir sessão de treino';

  readonly annotations = { readOnlyHint: false, destructiveHint: true };
  readonly description =
    'Exclui uma sessão de treino e todas as séries registradas nela. ' +
    'Exemplo: {"sessionId":"11111111-2222-4333-8444-555555555555"}';
  readonly inputSchema = {
    sessionId: z.string().uuid().describe('ID da sessão a excluir'),
  } as const;

  async execute(input: { sessionId: string }, { userId }: McpToolContext) {
    await this.sessions.delete(userId, input.sessionId);
    return { deleted: true };
  }
}
