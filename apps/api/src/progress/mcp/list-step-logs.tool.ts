import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { StepLogService } from '../step-log.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class ListStepLogsTool implements McpToolDef {
  constructor(private readonly stepLogs: StepLogService) {}

  readonly name = 'list_step_logs';
  readonly description = 'Lists step log entries for the user.';
  readonly inputSchema = {
    days: z.number().int().positive().optional(),
    cursor: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
  } as const;

  execute(input: { days?: number; cursor?: string; limit?: number }, { userId }: McpToolContext) {
    return this.stepLogs.list(userId, input);
  }
}
