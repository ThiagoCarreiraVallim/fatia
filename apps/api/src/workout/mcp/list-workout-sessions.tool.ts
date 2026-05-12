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
export class ListWorkoutSessionsTool implements McpToolDef {
  constructor(private readonly sessions: WorkoutSessionService) {}

  readonly name = 'list_workout_sessions';
  readonly description = 'Lista as sessões de treino do usuário com paginação por cursor.';
  readonly inputSchema = {
    date: z.string().optional().describe('Filtrar por data no formato YYYY-MM-DD (UTC)'),
    cursor: z.string().uuid().optional().describe('ID da última sessão da página anterior'),
    limit: z.number().int().min(1).max(50).optional().describe('Máximo de resultados (default 20)'),
  } as const;

  execute(input: { date?: string; cursor?: string; limit?: number }, { userId }: McpToolContext) {
    return this.sessions.list(userId, input);
  }
}
