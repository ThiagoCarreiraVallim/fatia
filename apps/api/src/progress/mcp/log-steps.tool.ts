import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { StepSource } from '@prisma/client';
import { StepLogService } from '../step-log.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class LogStepsTool implements McpToolDef {
  constructor(private readonly stepLogs: StepLogService) {}

  readonly name = 'log_steps';
  readonly description = 'Logs daily step count for a specific date.';
  readonly inputSchema = {
    date: z.string().describe('YYYY-MM-DD'),
    steps: z.number().int().min(0),
    source: z.nativeEnum(StepSource).optional(),
    notes: z.string().max(500).optional(),
  } as const;

  execute(
    input: { date: string; steps: number; source?: StepSource; notes?: string },
    { userId }: McpToolContext,
  ) {
    return this.stepLogs.create(userId, input);
  }
}
