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
  constructor(private readonly steps: StepLogService) {}
  readonly name = 'get_steps_for_date';
  readonly title = 'Passos de um dia';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly description = 'Retorna o valor efetivo de passos para um dia (max entre os logs).';
  readonly inputSchema = {
    date: z.string().optional().describe('YYYY-MM-DD; default hoje'),
  } as const;
  execute(input: { date?: string }, { userId, timezone }: McpToolContext) {
    return this.steps.getStepsForDateWithGoal(input.date, userId, timezone);
  }
}
