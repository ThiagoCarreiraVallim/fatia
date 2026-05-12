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
  readonly description = 'Retorna a sessão de treino ativa (ainda não finalizada), se houver.';
  readonly inputSchema = {} as const;

  execute(_input: Record<string, never>, { userId }: McpToolContext) {
    return this.sessions.findActive(userId);
  }
}
