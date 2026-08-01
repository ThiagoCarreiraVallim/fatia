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
export class UpdateWorkoutSessionTool implements McpToolDef {
  constructor(private readonly sessions: WorkoutSessionService) {}

  readonly name = 'update_workout_session';

  readonly title = 'Atualizar sessão de treino';

  readonly annotations = { readOnlyHint: false, destructiveHint: false };
  readonly description =
    'Atualiza as notas de uma sessão de treino, finalizada ou em andamento. Use quando o usuário quiser complementar ou corrigir o registro de um treino sem mexer nas séries — para as séries, use update_set.';
  readonly inputSchema = {
    sessionId: z.string().uuid().describe('ID da sessão a atualizar'),
    notes: z
      .string()
      .max(500)
      .optional()
      .describe('Novas notas da sessão (ex.: "treino cortado, ombro incomodando")'),
  } as const;

  execute(input: { sessionId: string; notes?: string }, { userId }: McpToolContext) {
    return this.sessions.update(userId, input.sessionId, { notes: input.notes });
  }
}
