import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { GoalStatus } from '@prisma/client';
import { GoalsService } from '../goals.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class UpdateGoalTool implements McpToolDef {
  constructor(private readonly goals: GoalsService) {}
  readonly name = 'update_goal';
  readonly title = 'Atualizar meta';
  readonly annotations = { readOnlyHint: false, destructiveHint: false };
  readonly hostedInference = false;
  readonly description =
    'Atualiza uma meta pessoal. Use `lastReportedValue` para reportar progresso manual em metas de tipo `body_fat` ou `custom`. ' +
    'Exemplo: {"goalId":"11111111-2222-4333-8444-555555555555","targetValue":73,"deadline":"2027-03-31T23:59:59-03:00"}';
  readonly inputSchema = {
    goalId: z.string().describe('ID da meta a atualizar'),
    title: z.string().min(1).max(120).optional().describe('Novo título da meta'),
    description: z.string().max(500).optional().describe('Novo detalhamento da meta'),
    targetValue: z.number().optional().describe('Novo valor alvo, na unidade da meta'),
    unit: z.string().min(1).max(30).optional().describe('Nova unidade (ex.: "kg", "%", "passos")'),
    deadline: z.string().optional().describe('ISO datetime; vazio para remover'),
    lastReportedValue: z
      .number()
      .optional()
      .describe('Valor atual reportado — use para metas sem fonte automática (body_fat, custom)'),
    status: z
      .nativeEnum(GoalStatus)
      .optional()
      .describe('Nova situação: active, completed, expired ou archived'),
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
