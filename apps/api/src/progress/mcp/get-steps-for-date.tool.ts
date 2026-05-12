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
export class GetStepsForDateTool implements McpToolDef {
  constructor(private readonly stepLogs: StepLogService) {}

  readonly name = 'get_steps_for_date';
  readonly description =
    'Returns the step count for a specific date (uses maximum value policy if multiple logs exist).';
  readonly inputSchema = {
    date: z.string().describe('YYYY-MM-DD'),
  } as const;

  execute(input: { date: string }, { userId }: McpToolContext) {
    return this.stepLogs
      .getStepsForDate(userId, input.date)
      .then((steps) => ({ date: input.date, steps }));
  }
}
