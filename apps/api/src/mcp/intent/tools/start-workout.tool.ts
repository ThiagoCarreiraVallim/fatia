import { Injectable } from '@nestjs/common';
import { McpTool, type McpToolContext } from '../../../common/decorators/tool.decorator';
import { SessionSetService } from '../../../workout/session-set.service';
import { WorkoutPlanService } from '../../../workout/workout-plan.service';
import { WorkoutSessionService } from '../../../workout/workout-session.service';
import { escolherPorNome, IntentTool } from '../composicao';
import type { IntentInput } from '../intent-surface';

/**
 * O plano pelo nome (`list_workout_plans`, que já traz os exercícios — o `get_workout_plan`
 * seria a mesma leitura), a sessão (`start_workout_session`) e a última série de cada
 * exercício do plano (`get_last_set_for_exercise`), que é a "última carga" do contrato.
 */
@Injectable()
@McpTool()
export class StartWorkoutTool extends IntentTool<'start_workout'> {
  constructor(
    private readonly plans: WorkoutPlanService,
    private readonly sessions: WorkoutSessionService,
    private readonly sets: SessionSetService,
  ) {
    super('start_workout');
  }

  async execute(input: IntentInput<'start_workout'>, { userId }: McpToolContext) {
    if (input.plan === undefined) {
      const session = await this.sessions.start(userId, { notes: input.notes }); // start_workout_session
      return { session, plan: null };
    }
    const planos = await this.plans.list(userId); // list_workout_plans
    const plano = escolherPorNome(input.plan, planos, (p) => p.name, 'plano de treino');
    const session = await this.sessions.start(userId, { planId: plano.id, notes: input.notes }); // start_workout_session
    const exercises = [];
    for (const item of plano.exercises) {
      exercises.push({
        ...item,
        lastSet: await this.sets.getLastForExercise(userId, item.exerciseId), // get_last_set_for_exercise
      });
    }
    return { session, plan: { id: plano.id, name: plano.name, exercises } };
  }
}
