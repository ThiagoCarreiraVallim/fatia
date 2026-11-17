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
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'progress' as const;
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

  /** Uma barra de progresso por meta (prancha IA-Cartoes, #384). */
  artifact(result: unknown) {
    const metas = result as {
      title: string;
      unit: string;
      currentValue: number | null;
      targetValue: number;
      progressPercent: number | null;
      status: string;
    }[];
    return {
      kind: 'progress',
      label: 'Metas',
      items: metas.map((meta) => ({
        title: meta.title,
        percent: meta.progressPercent ?? 0,
        detail:
          meta.currentValue === null
            ? `alvo ${meta.targetValue} ${meta.unit}`
            : `${meta.currentValue} de ${meta.targetValue} ${meta.unit}`,
        status: meta.status,
      })),
    };
  }
}
