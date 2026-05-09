import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { WeightLogService } from '../weight-log.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class LogWeightTool implements McpToolDef {
  constructor(private readonly weights: WeightLogService) {}
  readonly name = 'log_weight';
  readonly description = 'Registra uma medição de peso corporal.';
  readonly inputSchema = {
    weightKg: z.number().positive(),
    loggedAt: z.string().optional().describe('ISO datetime; default agora'),
    notes: z.string().max(500).optional(),
  } as const;
  async execute(
    input: { weightKg: number; loggedAt?: string; notes?: string },
    { userId }: McpToolContext,
  ) {
    const log = await this.weights.create(input, userId);
    return { weightLogId: log.id };
  }
}
