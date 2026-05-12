import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { StepSource } from '@prisma/client';
import { StepLogService } from '../step-log.service';
import { PrismaService } from '../../common/prisma.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class LogStepsTool implements McpToolDef {
  constructor(
    private readonly steps: StepLogService,
    private readonly prisma: PrismaService,
  ) {}
  readonly name = 'log_steps';
  readonly description =
    'Registra uma contagem de passos para um dia. Múltiplos logs por dia são permitidos — o servidor considera o maior valor (ADR 007).';
  readonly inputSchema = {
    date: z.string().optional().describe('YYYY-MM-DD; default hoje no fuso do user'),
    steps: z.number().int().min(0),
    source: z.nativeEnum(StepSource).optional(),
    notes: z.string().max(500).optional(),
  } as const;
  async execute(
    input: { date?: string; steps: number; source?: StepSource; notes?: string },
    { userId, timezone }: McpToolContext,
  ) {
    const log = await this.steps.create(input, userId, timezone);
    const effective = await this.steps.getStepsForDate(log.date, userId);
    const goals = await this.prisma.userGoals.findUnique({ where: { userId } });
    const goalReached =
      goals?.dailyStepsTarget !== undefined && goals?.dailyStepsTarget !== null
        ? effective.steps >= goals.dailyStepsTarget
        : null;
    return {
      stepLogId: log.id,
      effectiveStepsForDate: effective.steps,
      goalReached,
    };
  }
}
