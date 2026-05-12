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
export class UpdateWeightLogTool implements McpToolDef {
  constructor(private readonly weightLogs: WeightLogService) {}

  readonly name = 'update_weight_log';
  readonly description = 'Updates an existing weight log entry by ID.';
  readonly inputSchema = {
    id: z.string(),
    weightKg: z.number().positive().optional(),
    loggedAt: z.string().optional(),
    notes: z.string().max(500).optional(),
  } as const;

  execute(
    input: { id: string; weightKg?: number; loggedAt?: string; notes?: string },
    { userId }: McpToolContext,
  ) {
    return this.weightLogs.update(userId, input.id, {
      weightKg: input.weightKg,
      loggedAt: input.loggedAt,
      notes: input.notes,
    });
  }
}
