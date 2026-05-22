import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { GoalStatus } from '@prisma/client';
import { GoalsService } from '../goals.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

const STATUS_VALUES = Object.values(GoalStatus) as [GoalStatus, ...GoalStatus[]];

@Injectable()
@McpTool()
export class UpdateGoalTool implements McpToolDef {
  constructor(private readonly goals: GoalsService) {}
  readonly name = 'update_goal';
  readonly description =
    'Atualiza uma meta pessoal. Use `lastReportedValue` para reportar progresso manual em metas de tipo `body_fat` ou `custom`.';
  readonly inputSchema = {
    goalId: z.string(),
    title: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional(),
    targetValue: z.number().optional(),
    unit: z.string().min(1).max(30).optional(),
    deadline: z.string().optional().describe('ISO datetime; vazio para remover'),
    lastReportedValue: z.number().optional(),
    status: z.enum(STATUS_VALUES).optional(),
  } as const;
  async execute(
    input: {
      goalId: string;
      title?: string;
      description?: string;
      targetValue?: number;
      unit?: string;
      deadline?: string;
      lastReportedValue?: number;
      status?: GoalStatus;
    },
    { userId, timezone }: McpToolContext,
  ) {
    const { goalId, ...patch } = input;
    return this.goals.update(goalId, patch, userId, timezone);
  }
}
