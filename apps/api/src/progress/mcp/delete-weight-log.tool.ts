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
export class DeleteWeightLogTool implements McpToolDef {
  constructor(private readonly weightLogs: WeightLogService) {}

  readonly name = 'delete_weight_log';
  readonly description = 'Deletes a weight log entry by ID.';
  readonly inputSchema = {
    id: z.string(),
  } as const;

  execute(input: { id: string }, { userId }: McpToolContext) {
    return this.weightLogs.delete(userId, input.id);
  }
}
