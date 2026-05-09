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
  readonly description = 'Evolução de carga em um exercício de força (max_weight, 1RM ou volume).';
  readonly inputSchema = {
    exerciseId: z.number().int(),
    days: z.union([z.literal(30), z.literal(90), z.literal(180), z.literal(365)]),
    metric: z
      .enum(['max_weight', 'estimated_1rm', 'total_volume'])
      .optional()
      .default('max_weight'),
  } as const;
  execute(
    input: {
      exerciseId: number;
      days: number;
      metric?: 'max_weight' | 'estimated_1rm' | 'total_volume';
    },
    { userId, timezone }: McpToolContext,
  ) {
    return this.progress.strengthProgress(
      input.exerciseId,
      input.days,
      input.metric ?? 'max_weight',
      { userId, timezone },
    );
  }
}
