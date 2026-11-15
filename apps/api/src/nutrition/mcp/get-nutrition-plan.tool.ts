import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { NutritionPlanService } from '../nutrition-plan.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetNutritionPlanTool implements McpToolDef {
  constructor(private readonly plans: NutritionPlanService) {}
  readonly name = 'get_nutrition_plan';
  readonly title = 'Ver o plano alimentar';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly description =
    'Plano alimentar que um profissional da equipe enviou ao usuário: o plano em uso (active) e um ' +
    'novo esperando aceite (pending), com refeições, opções, itens, equivalentes liberados, o que já ' +
    'foi registrado e as trocas do dia, e os dias na faixa de calorias nos últimos 7. O plano é ' +
    'escrito pelo profissional; não sugira nem invente um. ' +
    'Exemplo: {"date":"2026-11-15"}';
  readonly inputSchema = {
    date: z.string().optional().describe('YYYY-MM-DD; default hoje no fuso do usuário'),
  } as const;
  execute(input: { date?: string }, { userId, timezone }: McpToolContext) {
    return this.plans.overview(userId, timezone, input.date);
  }
}
