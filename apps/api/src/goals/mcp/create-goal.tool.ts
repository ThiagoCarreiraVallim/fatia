import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { GoalKind } from '@prisma/client';
import { GoalsService } from '../goals.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

const KIND_VALUES = Object.values(GoalKind) as [GoalKind, ...GoalKind[]];

@Injectable()
@McpTool()
export class CreateGoalTool implements McpToolDef {
  constructor(private readonly goals: GoalsService) {}
  readonly name = 'create_goal';
  readonly description =
    'Cria uma meta pessoal do usuário (peso, % gordura, frequência de treino, passos médios ou métrica livre). Se `startValue` não for informado, o backend deriva do estado atual quando possível (kind=weight, workout_frequency, step_count).';
  readonly inputSchema = {
    kind: z.enum(KIND_VALUES).describe('Tipo da meta'),
    title: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    startValue: z.number().optional().describe('Valor inicial; derivado se omitido'),
    targetValue: z.number(),
    unit: z.string().min(1).max(30).describe('Ex.: "kg", "%", "treinos/semana", "passos"'),
    deadline: z.string().optional().describe('ISO datetime'),
    lastReportedValue: z
      .number()
      .optional()
      .describe('Valor atual reportado (usado para kind=body_fat ou custom)'),
  } as const;
  async execute(
    input: {
      kind: GoalKind;
      title: string;
      description?: string;
      startValue?: number;
      targetValue: number;
      unit: string;
      deadline?: string;
      lastReportedValue?: number;
    },
    { userId, timezone }: McpToolContext,
  ) {
    return this.goals.create(input, userId, timezone);
  }
}
