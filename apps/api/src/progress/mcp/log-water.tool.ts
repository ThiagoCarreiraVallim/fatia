import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { WaterLogService } from '../water-log.service';
import { PrismaService } from '../../common/prisma.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class LogWaterTool implements McpToolDef {
  constructor(
    private readonly waters: WaterLogService,
    private readonly prisma: PrismaService,
  ) {}
  readonly name = 'log_water';
  readonly description =
    'Registra consumo de água em mL para o dia. Múltiplos logs por dia são somados (cada copo/garrafa é um log).';
  readonly inputSchema = {
    ml: z.number().int().positive().describe('Volume em mL (ex.: 250 = copo, 500 = garrafa)'),
    date: z.string().optional().describe('YYYY-MM-DD; default hoje no fuso do user'),
    notes: z.string().max(500).optional(),
  } as const;
  async execute(
    input: { ml: number; date?: string; notes?: string },
    { userId, timezone }: McpToolContext,
  ) {
    const log = await this.waters.create(input, userId, timezone);
    const effective = await this.waters.getForDate(log.date, userId);
    const goals = await this.prisma.userGoals.findUnique({ where: { userId } });
    const targetMl = goals?.dailyWaterTargetMl ?? null;
    return {
      waterLogId: log.id,
      totalMlForDate: effective.totalMl,
      goalReached: targetMl !== null ? effective.totalMl >= targetMl : null,
      goalTargetMl: targetMl,
    };
  }
}
