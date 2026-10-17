import { BadRequestException, Injectable } from '@nestjs/common';
import { McpTool, type McpToolContext } from '../../../common/decorators/tool.decorator';
import { WorkoutSessionService } from '../../../workout/workout-session.service';
import { IntentTool } from '../composicao';
import type { IntentInput } from '../intent-surface';

/** A sessão em andamento (`get_active_workout_session`) e o `finish_workout_session` dela. */
@Injectable()
@McpTool()
export class FinishWorkoutTool extends IntentTool<'finish_workout'> {
  constructor(private readonly sessions: WorkoutSessionService) {
    super('finish_workout');
  }

  async execute(input: IntentInput<'finish_workout'>, { userId }: McpToolContext) {
    const ativa = await this.sessions.findActive(userId); // get_active_workout_session
    if (!ativa) throw new BadRequestException('Nenhuma sessão de treino em andamento.');
    return this.sessions.finish(userId, ativa.id, { notes: input.notes }); // finish_workout_session
  }
}
