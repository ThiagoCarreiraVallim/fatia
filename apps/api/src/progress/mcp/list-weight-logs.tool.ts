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
  constructor(private readonly weights: WeightLogService) {}
  readonly name = 'list_weight_logs';
  readonly description = 'Lista logs de peso, com filtro de período e cursor de paginação.';
  readonly inputSchema = {
    from: z.string().optional(),
    to: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  } as const;
  execute(
    input: { from?: string; to?: string; limit?: number; cursor?: string },
    { userId }: McpToolContext,
  ) {
    return this.weights.list(input, userId);
  }
}
