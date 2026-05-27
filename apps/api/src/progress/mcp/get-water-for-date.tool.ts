import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { WaterLogService } from '../water-log.service';
import { PrismaService } from '../../common/prisma.service';
import { todayInTz } from '../helpers/date-tz';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetWaterForDateTool implements McpToolDef {
  constructor(
    private readonly waters: WaterLogService,
    private readonly prisma: PrismaService,
  ) {}
  readonly name = 'get_water_for_date';
  readonly description = 'Retorna o total de água consumida em um dia (soma de todos os logs).';
  readonly inputSchema = {
    date: z.string().optional().describe('YYYY-MM-DD; default hoje'),
  } as const;
  async execute(input: { date?: string }, { userId, timezone }: McpToolContext) {
    const date = input.date ?? todayInTz(timezone);
    const result = await this.waters.getForDate(date, userId);
    const goals = await this.prisma.userGoals.findUnique({ where: { userId } });
    const targetMl = goals?.dailyWaterTargetMl ?? null;
    return {
      ...result,
      goalReached: targetMl !== null ? result.totalMl >= targetMl : null,
      goalTargetMl: targetMl,
    };
  }
}
