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
export class GetWeightProgressTool implements McpToolDef {
  constructor(private readonly progress: ProgressService) {}
  readonly name = 'get_weight_progress';
  readonly title = 'Evolução do peso';
  readonly annotations = { readOnlyHint: true, destructiveHint: false };
  readonly description = 'Série temporal de peso, médias semanais e delta total no período.';
  readonly inputSchema = {
    days: z
      .union([z.literal(14), z.literal(30), z.literal(90), z.literal(180), z.literal(365)])
      .describe('Janela de análise em dias — um de 14, 30, 90, 180 ou 365'),
  } as const;
  execute(input: { days: number }, { userId, timezone }: McpToolContext) {
    return this.progress.weightProgress(input.days, { userId, timezone });
  }
}
