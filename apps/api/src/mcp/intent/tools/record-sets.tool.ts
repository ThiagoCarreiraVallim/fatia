import { BadRequestException, Injectable } from '@nestjs/common';
import { McpTool, type McpToolContext } from '../../../common/decorators/tool.decorator';
import { ExerciseService } from '../../../workout/exercise.service';
import { SessionSetService } from '../../../workout/session-set.service';
import { WorkoutSessionService } from '../../../workout/workout-session.service';
import { IntentTool } from '../composicao';
import { resolverExercicio } from '../exercicio';
import type { IntentInput } from '../intent-surface';

/**
 * A sessão em andamento (`get_active_workout_session`), o exercício pelo nome
 * (`search_exercise`, priorizando o que a pessoa já treinou) e `sets` vezes o `log_set` com a
 * mesma série — "3 de 10 com 60" são três séries, como o agente registraria no braço A.
 */
@Injectable()
@McpTool()
export class RecordSetsTool extends IntentTool<'record_sets'> {
  constructor(
    private readonly sessions: WorkoutSessionService,
    private readonly exercises: ExerciseService,
    private readonly sets: SessionSetService,
  ) {
    super('record_sets');
  }

  async execute(input: IntentInput<'record_sets'>, { userId }: McpToolContext) {
    const ativa = await this.sessions.findActive(userId); // get_active_workout_session
    if (!ativa) {
      throw new BadRequestException(
        'Nenhuma sessão de treino em andamento. Comece uma com start_workout e registre de novo.',
      );
    }
    const exercise = await resolverExercicio(this.exercises, this.sets, userId, input.exercise);
    const registradas = [];
    for (let i = 0; i < input.sets; i++) {
      registradas.push(
        await this.sets.create(userId, {
          sessionId: ativa.id,
          exerciseId: exercise.id,
          weightKg: input.weightKg,
          reps: input.reps,
          rpe: input.rpe,
          durationSeconds: input.durationSeconds,
          distanceMeters: input.distanceMeters,
        }), // log_set
      );
    }
    return {
      sessionId: ativa.id,
      exercise: { id: exercise.id, name: exercise.name },
      sets: registradas,
    };
  }
}
