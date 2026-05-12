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
export class GetStepsHistoryTool implements McpToolDef {
  constructor(private readonly stepLogs: StepLogService) {}

  readonly name = 'get_steps_history';
  readonly description = 'Returns daily step history for recent days, filling missing days with 0.';
  readonly inputSchema = {
    days: z.number().int().positive().optional().default(30),
    timezone: z.string().optional().default('UTC'),
  } as const;

  execute(input: { days?: number; timezone?: string }, { userId }: McpToolContext) {
    return this.stepLogs.getHistory(userId, input.days ?? 30, input.timezone ?? 'UTC');
  }
}
