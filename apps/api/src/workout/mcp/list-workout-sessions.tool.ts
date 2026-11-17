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

  readonly title = 'Listar sessões de treino';

  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };

  readonly hostedInference = false;
  readonly card = 'report' as const;
  readonly description =
    'Lista as sessões de treino do usuário com paginação por cursor. Cada sessão traz o tipo ' +
    '(kind: "plan", "circuit" ou "free" — treino livre, inclusive o só de cardio) e a sensação ' +
    '(feeling: 1 Leve a 5 No limite).';
  readonly inputSchema = {
    date: z.string().optional().describe('Filtrar por data no formato YYYY-MM-DD (UTC)'),
    cursor: z.string().uuid().optional().describe('ID da última sessão da página anterior'),
    limit: z.number().int().min(1).max(50).optional().describe('Máximo de resultados (default 20)'),
    kind: z
      .enum(['plan', 'circuit', 'free'])
      .optional()
      .describe('Só um tipo: plano, circuito ou livre (default: todos)'),
  } as const;

  execute(
    input: { date?: string; cursor?: string; limit?: number; kind?: 'plan' | 'circuit' | 'free' },
    { userId }: McpToolContext,
  ) {
    return this.sessions.list(userId, input);
  }
}
