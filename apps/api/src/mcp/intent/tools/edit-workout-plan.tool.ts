import { BadRequestException, Injectable } from '@nestjs/common';
import { McpTool, type McpToolContext } from '../../../common/decorators/tool.decorator';
import { ExerciseService } from '../../../workout/exercise.service';
import { SessionSetService } from '../../../workout/session-set.service';
import { WorkoutPlanService } from '../../../workout/workout-plan.service';
import { escolherPorNome, IntentTool } from '../composicao';
import { resolverExercicio } from '../exercicio';
import type { IntentInput } from '../intent-surface';

/** O que um exercício acrescentado sem séries recebe — e a resposta diz que recebeu. */
const SERIES_PADRAO = 3;
const REPETICOES_PADRAO = '8-12';

/**
 * O plano pelo nome (`list_workout_plans`), e cada parte do pedido numa perna:
 * acrescentar é `search_exercise` + `add_exercise_to_plan` no fim do plano; mudar séries é
 * `update_plan_exercise` no exercício do plano com aquele nome; reordenar é
 * `reorder_plan_exercises` com os citados na frente e os outros na ordem de antes. Não remove
 * nada: `remove_exercise_from_plan` fica igual nos dois braços.
 */
@Injectable()
@McpTool()
export class EditWorkoutPlanTool extends IntentTool<'edit_workout_plan'> {
  constructor(
    private readonly plans: WorkoutPlanService,
    private readonly exercises: ExerciseService,
    private readonly sets: SessionSetService,
  ) {
    super('edit_workout_plan');
  }

  async execute(input: IntentInput<'edit_workout_plan'>, { userId }: McpToolContext) {
    if (!input.add?.length && !input.update?.length && !input.order?.length) {
      throw new BadRequestException('Nada a editar: envie `add`, `update` ou `order`.');
    }
    const planos = await this.plans.list(userId); // list_workout_plans
    const plano = escolherPorNome(input.plan, planos, (p) => p.name, 'plano de treino');

    const added = [];
    let proxima = Math.max(0, ...plano.exercises.map((e) => e.order)) + 1;
    for (const pedido of input.add ?? []) {
      const exercise = await resolverExercicio(this.exercises, this.sets, userId, pedido.exercise);
      const defaults = {
        targetSets: pedido.targetSets === undefined,
        targetReps: pedido.targetReps === undefined,
      };
      const criado = await this.plans.addExercise(userId, plano.id, {
        exerciseId: exercise.id,
        order: proxima++,
        targetSets: pedido.targetSets ?? SERIES_PADRAO,
        targetReps: pedido.targetReps ?? REPETICOES_PADRAO,
      }); // add_exercise_to_plan
      added.push({ ...criado, defaultsApplied: defaults });
    }

    const updated = [];
    for (const pedido of input.update ?? []) {
      const alvo = escolherPorNome(
        pedido.exercise,
        plano.exercises,
        (e) => e.exercise.name,
        'exercício neste plano',
      );
      updated.push(
        await this.plans.updatePlanExercise(userId, plano.id, alvo.id, {
          targetSets: pedido.targetSets,
          targetReps: pedido.targetReps,
        }), // update_plan_exercise
      );
    }

    let reordered: unknown = undefined;
    if (input.order?.length) {
      const atual = await this.plans.findById(userId, plano.id); // get_workout_plan
      const citados = input.order.map((nome) =>
        escolherPorNome(nome, atual.exercises, (e) => e.exercise.name, 'exercício neste plano'),
      );
      const resto = atual.exercises.filter((e) => !citados.some((c) => c.id === e.id));
      const base = Math.min(...atual.exercises.map((e) => e.order));
      reordered = await this.plans.reorderExercises(userId, plano.id, {
        exercises: [...citados, ...resto].map((e, i) => ({ id: e.id, order: base + i })),
      }); // reorder_plan_exercises
    }

    return {
      planId: plano.id,
      planName: plano.name,
      added,
      updated,
      ...(reordered !== undefined && { reordered }),
    };
  }
}
