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
    "Returns cardio progress for a specific exercise. Metric can be 'duration' (seconds), 'distance' (meters), 'pace' (seconds/km), or 'kcal'.";
  readonly inputSchema = {
    exerciseId: z.number().int().positive(),
    days: z.number().int().positive().optional().default(30),
    metric: z.enum(['duration', 'distance', 'pace', 'kcal']).optional().default('duration'),
    timezone: z.string().optional(),
  } as const;

  execute(
    input: {
      exerciseId: number;
      days?: number;
      metric?: 'duration' | 'distance' | 'pace' | 'kcal';
      timezone?: string;
    },
    { userId }: McpToolContext,
  ) {
    return this.progress.cardioProgress(
      userId,
      input.exerciseId,
      input.days ?? 30,
      input.metric ?? 'duration',
      input.timezone ?? 'UTC',
    );
  }
}
