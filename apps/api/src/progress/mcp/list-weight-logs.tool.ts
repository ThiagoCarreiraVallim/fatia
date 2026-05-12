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
export class ListWeightLogsTool implements McpToolDef {
  constructor(private readonly weightLogs: WeightLogService) {}

  readonly name = 'list_weight_logs';
  readonly description =
    'Lists weight log entries for the user, optionally filtered by recent days.';
  readonly inputSchema = {
    days: z.number().int().positive().optional().default(30),
    cursor: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
  } as const;

  execute(input: { days?: number; cursor?: string; limit?: number }, { userId }: McpToolContext) {
    return this.weightLogs.list(userId, input);
  }
}
