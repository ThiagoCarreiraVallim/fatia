import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { WorkoutPlanService } from '../workout-plan.service';
import { CIRCUIT_FORMATS, MAX_CIRCUIT_EXERCISES, MAX_CIRCUIT_TARGET } from '../helpers/circuit';

type CircuitInput = {
  format: (typeof CIRCUIT_FORMATS)[number];
  durationMinutes?: number;
  workSeconds?: number;
  restSeconds?: number;
  intervals?: number;
  rounds?: number;
  restBetweenRoundsSeconds?: number;
};

type ExerciseInput = { exerciseId: number; reps?: number; seconds?: number };

@Injectable()
@McpTool()
export class CreateWorkoutPlanTool implements McpToolDef {
  constructor(private readonly plans: WorkoutPlanService) {}

  readonly name = 'create_workout_plan';

  readonly title = 'Criar plano de treino';

  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };

  readonly hostedInference = false;
  readonly description =
    'Cria um novo plano de treino com nome. Para um circuito com timer (AMRAP, EMOM, Tabata ou ' +
    'For Time), informe circuit com o formato e os campos dele (AMRAP e EMOM: durationMinutes; ' +
    'TABATA: workSeconds, restSeconds e intervals; FOR_TIME: rounds e, se houver, ' +
    'restBetweenRoundsSeconds) e exercises na ordem, cada um com reps ou seconds por round. ' +
    'Exemplo: {"name":"Treino A - peito e tríceps"} ' +
    'Exemplo (circuito): {"name":"AMRAP 12","circuit":{"format":"AMRAP","durationMinutes":12},"exercises":[{"exerciseId":42,"reps":15},{"exerciseId":77,"seconds":30}]}';
  readonly inputSchema = {
    name: z.string().min(1).max(100).describe('Nome do plano (ex: "Push", "Pull", "HIIT")'),
    circuit: z
      .object({
        format: z.enum(CIRCUIT_FORMATS).describe('AMRAP, EMOM, TABATA ou FOR_TIME'),
        durationMinutes: z.number().int().min(1).max(120).optional().describe('AMRAP e EMOM'),
        workSeconds: z.number().int().min(5).max(600).optional().describe('TABATA: trabalho'),
        restSeconds: z.number().int().min(0).max(600).optional().describe('TABATA: descanso'),
        intervals: z.number().int().min(1).max(60).optional().describe('TABATA: intervalos'),
        rounds: z.number().int().min(1).max(100).optional().describe('FOR_TIME: rounds'),
        restBetweenRoundsSeconds: z
          .number()
          .int()
          .min(0)
          .max(900)
          .optional()
          .describe('FOR_TIME: descanso entre rounds'),
      })
      .optional()
      .describe('Só para circuito com timer'),
    exercises: z
      .array(
        z.object({
          exerciseId: z.number().int().positive().describe('ID do exercício (search_exercise)'),
          reps: z.number().int().min(1).max(MAX_CIRCUIT_TARGET).optional(),
          seconds: z.number().int().min(1).max(MAX_CIRCUIT_TARGET).optional(),
        }),
      )
      .max(MAX_CIRCUIT_EXERCISES)
      .optional()
      .describe('Exercícios do circuito na ordem, com reps ou seconds por round'),
  } as const;

  execute(
    input: { name: string; circuit?: CircuitInput; exercises?: ExerciseInput[] },
    { userId }: McpToolContext,
  ) {
    if (!input.circuit) {
      if (input.exercises?.length) {
        throw new BadRequestException(
          'exercises só vale com circuit; num plano de séries use add_exercise_to_plan.',
        );
      }
      return this.plans.create(userId, { name: input.name });
    }
    const { durationMinutes, ...config } = input.circuit;
    const exercises = (input.exercises ?? []).map((e) => {
      if ((e.reps === undefined) === (e.seconds === undefined)) {
        throw new BadRequestException(
          'Cada exercício do circuito leva reps ou seconds (um dos dois).',
        );
      }
      return e.reps !== undefined
        ? { exerciseId: e.exerciseId, unit: 'REPS' as const, target: e.reps }
        : { exerciseId: e.exerciseId, unit: 'SECONDS' as const, target: e.seconds! };
    });
    if (exercises.length === 0) {
      throw new BadRequestException('Circuito precisa de pelo menos um exercício em exercises.');
    }
    return this.plans.createCircuit(userId, {
      name: input.name,
      ...config,
      durationSeconds: durationMinutes !== undefined ? durationMinutes * 60 : undefined,
      exercises,
    });
  }
}
