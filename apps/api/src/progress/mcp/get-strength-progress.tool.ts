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
export class GetStrengthProgressTool implements McpToolDef {
  constructor(private readonly progress: ProgressService) {}

  readonly name = 'get_strength_progress';
  readonly description =
    "Returns strength progress for a specific exercise. Metric can be '1rm' (estimated 1-rep max), 'volume' (total kg*reps), or 'weight' (max weight lifted).";
  readonly inputSchema = {
    exerciseId: z.number().int().positive(),
    days: z.number().int().positive().optional().default(30),
    metric: z.enum(['1rm', 'volume', 'weight']).optional().default('1rm'),
    timezone: z.string().optional(),
  } as const;

  execute(
    input: {
      exerciseId: number;
      days?: number;
      metric?: '1rm' | 'volume' | 'weight';
      timezone?: string;
    },
    { userId }: McpToolContext,
  ) {
    return this.progress.strengthProgress(
      userId,
      input.exerciseId,
      input.days ?? 30,
      input.metric ?? '1rm',
      input.timezone ?? 'UTC',
    );
  }
}
