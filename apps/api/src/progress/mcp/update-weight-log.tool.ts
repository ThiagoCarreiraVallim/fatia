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
  constructor(private readonly weights: WeightLogService) {}
  readonly name = 'update_weight_log';
  readonly description = 'Atualiza um log de peso existente.';
  readonly inputSchema = {
    weightLogId: z.string().uuid(),
    weightKg: z.number().positive().optional(),
    loggedAt: z.string().optional(),
    notes: z.string().max(500).optional(),
  } as const;
  execute(
    input: { weightLogId: string; weightKg?: number; loggedAt?: string; notes?: string },
    { userId }: McpToolContext,
  ) {
    const { weightLogId, ...patch } = input;
    return this.weights.update(weightLogId, patch, userId);
  }
}
