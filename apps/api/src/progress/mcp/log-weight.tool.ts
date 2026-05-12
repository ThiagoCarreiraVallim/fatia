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
  constructor(private readonly weightLogs: WeightLogService) {}

  readonly name = 'log_weight';
  readonly description =
    'Logs a body weight measurement. Call this when the user reports their weight.';
  readonly inputSchema = {
    weightKg: z.number().positive(),
    loggedAt: z.string().describe('ISO 8601 datetime'),
    notes: z.string().max(500).optional(),
  } as const;

  execute(
    input: { weightKg: number; loggedAt: string; notes?: string },
    { userId }: McpToolContext,
  ) {
    return this.weightLogs.create(userId, input);
  }
}
