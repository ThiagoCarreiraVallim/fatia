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
export class UpdateStepLogTool implements McpToolDef {
  constructor(private readonly stepLogs: StepLogService) {}

  readonly name = 'update_step_log';
  readonly description = 'Updates an existing step log entry by ID.';
  readonly inputSchema = {
    id: z.string(),
    steps: z.number().int().min(0).optional(),
    notes: z.string().max(500).optional(),
  } as const;

  execute(input: { id: string; steps?: number; notes?: string }, { userId }: McpToolContext) {
    return this.stepLogs.update(userId, input.id, { steps: input.steps, notes: input.notes });
  }
}
