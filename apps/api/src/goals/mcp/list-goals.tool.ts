import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { GoalKind, GoalStatus } from '@prisma/client';
import { GoalsService } from '../goals.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class ListGoalsTool implements McpToolDef {
  constructor(private readonly goals: GoalsService) {}
  readonly name = 'list_goals';
  readonly title = 'Listar metas';
  readonly annotations = { readOnlyHint: true, destructiveHint: false };
  readonly description =
    'Lista metas pessoais do usuário com progresso calculado. Filtros opcionais por status e tipo.';
  readonly inputSchema = {
    status: z
      .nativeEnum(GoalStatus)
      .optional()
      .describe('Filtra por situação: active, completed, expired ou archived'),
    kind: z
      .nativeEnum(GoalKind)
      .optional()
      .describe('Filtra por tipo: weight, body_fat, workout_frequency, step_count ou custom'),
  } as const;
  async execute(
    input: { status?: GoalStatus; kind?: GoalKind },
    { userId, timezone }: McpToolContext,
  ) {
    return this.goals.list(input, userId, timezone);
  }
}
