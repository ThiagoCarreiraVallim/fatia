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
  readonly description = 'Inicia uma sessão de treino (livre ou vinculada a um plano).';
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
