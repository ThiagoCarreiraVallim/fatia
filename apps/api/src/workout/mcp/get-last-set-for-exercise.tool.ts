import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { SessionSetService } from '../session-set.service';

@Injectable()
@McpTool()
export class GetLastSetForExerciseTool implements McpToolDef {
  constructor(private readonly sets: SessionSetService) {}

  readonly name = 'get_last_set_for_exercise';

  readonly title = 'Última série do exercício';

  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };

  readonly hostedInference = false;
  readonly card = 'metric' as const;
  readonly description =
    'Retorna a última série registrada para um exercício, útil para sugerir carga do próximo treino.';
  readonly inputSchema = {
    exerciseId: z.number().int().positive().describe('ID do exercício'),
    before: z
      .string()
      .optional()
      .describe('ISO8601 — retorna apenas séries de sessões anteriores a essa data'),
  } as const;

  execute(input: { exerciseId: number; before?: string }, { userId }: McpToolContext) {
    return this.sets.getLastForExercise(userId, input.exerciseId, input.before);
  }

  /**
   * A carga da última série, com as repetições embaixo; no cardio, a distância ou o tempo
   * (prancha IA-Cartoes, #384). Sem série nenhuma, não há cartão.
   */
  artifact(result: unknown) {
    const serie = result as Awaited<ReturnType<SessionSetService['getLastForExercise']>>;
    if (!serie) return null;
    const label = `Última série de ${serie.exercise.name}`;
    const extras = [
      ...(serie.reps == null ? [] : [{ label: 'Repetições', value: serie.reps }]),
      ...(serie.rpe == null ? [] : [{ label: 'RPE', value: serie.rpe }]),
    ];
    if (serie.weightKg != null) {
      return { kind: 'metric', label, value: serie.weightKg, unit: 'kg', breakdown: extras };
    }
    if (serie.distanceMeters != null) {
      return { kind: 'metric', label, value: serie.distanceMeters / 1000, unit: 'km' };
    }
    if (serie.durationSeconds != null) {
      return { kind: 'metric', label, value: Math.round(serie.durationSeconds / 60), unit: 'min' };
    }
    return serie.reps == null
      ? null
      : { kind: 'metric', label, value: serie.reps, unit: 'repetições' };
  }
}
