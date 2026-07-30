import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ProgressService } from '../progress.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetCardioProgressTool implements McpToolDef {
  constructor(private readonly progress: ProgressService) {}
  readonly name = 'get_cardio_progress';
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
}
