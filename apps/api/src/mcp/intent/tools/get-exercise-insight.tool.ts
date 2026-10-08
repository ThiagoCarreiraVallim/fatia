import { Injectable } from '@nestjs/common';
import { McpTool, type McpToolContext } from '../../../common/decorators/tool.decorator';
import { ProgressService } from '../../../progress/progress.service';
import { ExerciseService } from '../../../workout/exercise.service';
import { isCardioExercise } from '../../../workout/helpers/is-cardio';
import { PrescriptionService } from '../../../workout/prescription.service';
import { SessionSetService } from '../../../workout/session-set.service';
import { IntentTool } from '../composicao';
import { resolverExercicio } from '../exercicio';
import type { IntentInput } from '../intent-surface';

/** O default de janela do contrato. */
const DIAS_PADRAO = 90;

/**
 * Cada `aspect` é uma perna; sem `aspect`, todas. A evolução é a de cardio ou a de força
 * conforme o exercício — a mesma escolha que o agente faria entre `get_cardio_progress` e
 * `get_strength_progress`, cada uma com a métrica default dela. Os detalhes do exercício
 * (`get_exercise_details`) vêm sempre, e são eles que respondem "como faz".
 */
@Injectable()
@McpTool()
export class GetExerciseInsightTool extends IntentTool<'get_exercise_insight'> {
  constructor(
    private readonly exercises: ExerciseService,
    private readonly sets: SessionSetService,
    private readonly progress: ProgressService,
    private readonly prescriptions: PrescriptionService,
  ) {
    super('get_exercise_insight');
  }

  async execute(input: IntentInput<'get_exercise_insight'>, { userId, timezone }: McpToolContext) {
    const ctx = { userId, timezone };
    const encontrado = await resolverExercicio(this.exercises, this.sets, userId, input.exercise);
    const exercise = await this.exercises.get(userId, encontrado.id); // get_exercise_details
    const quer = (aspect: NonNullable<typeof input.aspect>) =>
      input.aspect === undefined || input.aspect === aspect;
    const dias = input.days ?? DIAS_PADRAO;

    return {
      exercise,
      ...(quer('last_session') && {
        lastSession: await this.sets.getLastForExercise(userId, exercise.id), // get_last_set_for_exercise
      }),
      ...(quer('personal_record') && {
        personalRecord: await this.sets.getPersonalRecord(userId, exercise.id), // get_personal_record
      }),
      ...(quer('progress') && {
        progress: isCardioExercise(exercise)
          ? await this.progress.cardioProgress(exercise.id, dias, 'duration', ctx) // get_cardio_progress
          : await this.progress.strengthProgress(exercise.id, dias, 'max_weight', ctx), // get_strength_progress
      }),
      ...(quer('next_load') && {
        nextLoad: await this.prescriptions.forExercise(userId, exercise.id), // get_load_prescription
      }),
    };
  }
}
