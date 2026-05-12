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
  constructor(private readonly steps: StepLogService) {}
  readonly name = 'delete_step_log';
  readonly description = 'Deleta um log de passos.';
  readonly inputSchema = { stepLogId: z.string().uuid() } as const;
  execute(input: { stepLogId: string }, { userId }: McpToolContext) {
    return this.steps.delete(input.stepLogId, userId);
  }
}
