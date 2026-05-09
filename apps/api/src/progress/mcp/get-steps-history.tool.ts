import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { StepLogService } from '../step-log.service';
import { PrismaService } from '../../common/prisma.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetStepsHistoryTool implements McpToolDef {
  constructor(
    private readonly steps: StepLogService,
    private readonly prisma: PrismaService,
  ) {}
  readonly name = 'get_steps_history';
  readonly description = 'Série temporal de passos por dia (preenche dias vazios com 0).';
  readonly inputSchema = {
    days: z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(90), z.literal(180)]),
  } as const;
  async execute(input: { days: number }, { userId, timezone }: McpToolContext) {
    const series = await this.steps.getHistory(input.days, userId, timezone);
    const goals = await this.prisma.userGoals.findUnique({ where: { userId } });
    const target = goals?.dailyStepsTarget ?? null;
    const days = series.map((p) => ({
      ...p,
      goalReached: target !== null ? p.steps >= target : null,
    }));
    const totalDaysLogged = days.filter((d) => d.steps > 0).length;
    const totalSteps = days.reduce((a, p) => a + p.steps, 0);
    const averageDaily = days.length ? totalSteps / days.length : 0;
    const daysWithGoalReached = target !== null ? days.filter((d) => d.steps >= target).length : 0;
    return { days, averageDaily, daysWithGoalReached, totalDaysLogged };
  }
}
