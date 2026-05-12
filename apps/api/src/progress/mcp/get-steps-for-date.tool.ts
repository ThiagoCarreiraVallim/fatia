import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { StepLogService } from '../step-log.service';
import { PrismaService } from '../../common/prisma.service';
import { todayInTz } from '../helpers/date-tz';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetStepsForDateTool implements McpToolDef {
  constructor(
    private readonly steps: StepLogService,
    private readonly prisma: PrismaService,
  ) {}
  readonly name = 'get_steps_for_date';
  readonly description = 'Retorna o valor efetivo de passos para um dia (max entre os logs).';
  readonly inputSchema = {
    date: z.string().optional().describe('YYYY-MM-DD; default hoje'),
  } as const;
  async execute(input: { date?: string }, { userId, timezone }: McpToolContext) {
    const date = input.date ?? todayInTz(timezone);
    const result = await this.steps.getStepsForDate(date, userId);
    const goals = await this.prisma.userGoals.findUnique({ where: { userId } });
    const target = goals?.dailyStepsTarget ?? null;
    return {
      ...result,
      goalReached: target !== null ? result.steps >= target : null,
      goalTarget: target,
    };
  }
}
