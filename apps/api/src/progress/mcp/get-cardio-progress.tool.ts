import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ProgressService } from '../progress.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import type { CardioMetric } from '../progress.service';

/** O nome, a unidade e o divisor de cada métrica no cartão: segundos viram minutos, metros km. */
const CARDIO_METRIC: Record<CardioMetric, { titulo: string; unit: string; escala: number }> = {
  duration: { titulo: 'Tempo', unit: 'min', escala: 60 },
  distance: { titulo: 'Distância', unit: 'km', escala: 1000 },
  pace: { titulo: 'Ritmo', unit: 'min/km', escala: 60 },
  kcal: { titulo: 'Calorias', unit: 'kcal', escala: 1 },
};

@Injectable()
@McpTool()
export class GetCardioProgressTool implements McpToolDef {
  constructor(private readonly progress: ProgressService) {}
  readonly name = 'get_cardio_progress';
  readonly title = 'Evolução no cardio';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'timeline' as const;
  readonly description =
    'Evolução de cardio em um exercício (duration, distance, pace ou kcal). Exercise deve ter muscleGroup=cardio.';
  readonly inputSchema = {
    exerciseId: z
      .number()
      .int()
      .describe('ID do exercício de cardio a analisar, obtido via search_exercise'),
    days: z
      .union([z.literal(30), z.literal(90), z.literal(180), z.literal(365)])
      .describe('Janela de análise em dias — um de 30, 90, 180 ou 365'),
    metric: z
      .enum(['duration', 'distance', 'pace', 'kcal'])
      .optional()
      .default('duration')
      .describe(
        'Métrica a acompanhar: duration (tempo), distance (distância), pace (ritmo) ou kcal (calorias). Default duration',
      ),
  } as const;
  execute(
    input: { exerciseId: number; days: number; metric?: 'duration' | 'distance' | 'pace' | 'kcal' },
    { userId, timezone }: McpToolContext,
  ) {
    return this.progress.cardioProgress(input.exerciseId, input.days, input.metric ?? 'duration', {
      userId,
      timezone,
    });
  }

  /**
   * A métrica pedida sessão a sessão (prancha IA-Cartoes, #384). Tempo e ritmo saem em
   * minutos e a distância em km: segundos e metros não se leem num gráfico.
   */
  artifact(result: unknown, input: { days: number }) {
    const serie = result as Awaited<ReturnType<ProgressService['cardioProgress']>>;
    const { titulo, unit, escala } = CARDIO_METRIC[serie.metric];
    const events = serie.points.map((p) => ({
      date: p.sessionDate,
      value: Math.round((p.value / escala) * 10) / 10,
    }));
    const primeiro = events[0]?.value;
    const ultimo = events[events.length - 1]?.value;
    return {
      kind: 'timeline',
      label: `${titulo}${serie.exercise ? ` de ${serie.exercise.name}` : ''} nos últimos ${input.days} dias`,
      unit,
      delta: events.length < 2 ? null : Math.round((ultimo - primeiro) * 10) / 10,
      events,
    };
  }
}
