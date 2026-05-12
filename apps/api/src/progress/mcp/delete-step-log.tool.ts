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
export class DeleteStepLogTool implements McpToolDef {
  constructor(private readonly stepLogs: StepLogService) {}

  readonly name = 'delete_step_log';
  readonly description = 'Deletes a step log entry by ID.';
  readonly inputSchema = {
    id: z.string(),
  } as const;

  execute(input: { id: string }, { userId }: McpToolContext) {
    return this.stepLogs.delete(userId, input.id);
  }
}
