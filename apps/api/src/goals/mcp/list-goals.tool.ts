import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { GoalKind, GoalStatus } from '@prisma/client';
import { GoalsService } from '../goals.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

const KIND_VALUES = Object.values(GoalKind) as [GoalKind, ...GoalKind[]];
const STATUS_VALUES = Object.values(GoalStatus) as [GoalStatus, ...GoalStatus[]];

@Injectable()
@McpTool()
export class ListGoalsTool implements McpToolDef {
  constructor(private readonly goals: GoalsService) {}
  readonly name = 'list_goals';
  readonly description =
    'Lista metas pessoais do usuário com progresso calculado. Filtros opcionais por status e tipo.';
  readonly inputSchema = {
    status: z.enum(STATUS_VALUES).optional(),
    kind: z.enum(KIND_VALUES).optional(),
  } as const;
  async execute(
    input: { status?: GoalStatus; kind?: GoalKind },
    { userId, timezone }: McpToolContext,
  ) {
    return this.goals.list(input, userId, timezone);
  }
}
