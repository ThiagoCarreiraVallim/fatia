import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { StepLogService } from '../step-log.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { dayMonth } from '../../mcp/card-format';

@Injectable()
@McpTool()
export class GetStepsForDateTool implements McpToolDef {
  constructor(private readonly steps: StepLogService) {}
  readonly name = 'get_steps_for_date';
  readonly title = 'Passos de um dia';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'metric' as const;
  readonly description = 'Retorna o valor efetivo de passos para um dia (max entre os logs).';
  readonly inputSchema = {
    date: z.string().optional().describe('YYYY-MM-DD; default hoje'),
  } as const;
  execute(input: { date?: string }, { userId, timezone }: McpToolContext) {
    return this.steps.getStepsForDateWithGoal(input.date, userId, timezone);
  }

  /** Os passos do dia contra a meta (prancha IA-Cartoes, #384). */
  artifact(result: unknown) {
    const dia = result as Awaited<ReturnType<StepLogService['getStepsForDateWithGoal']>>;
    return {
      kind: 'metric',
      label: `Passos em ${dayMonth(dia.date)}`,
      value: dia.steps,
      unit: 'passos',
      ...(dia.goalTarget == null ? {} : { target: { min: dia.goalTarget } }),
    };
  }
}
