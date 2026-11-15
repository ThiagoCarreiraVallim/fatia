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
export class LogPlanMealTool implements McpToolDef {
  constructor(private readonly plans: NutritionPlanService) {}
  readonly name = 'log_plan_meal';
  readonly title = 'Registrar refeição do plano';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    '"Comi isso": registra no diário uma refeição do plano alimentar em uso, com as trocas do dia ' +
    'aplicadas. Refeição com mais de uma opção exige optionId. Uma vez por refeição e dia. ' +
    'Exemplo: {"planMealId":"11111111-2222-4333-8444-555555555555","optionId":"66666666-7777-4888-8999-000000000000"}';
  readonly inputSchema = {
    planMealId: z.string().uuid().describe('ID da refeição do plano (active.meals[].id)'),
    optionId: z
      .string()
      .uuid()
      .optional()
      .describe('ID da opção comida (meals[].options[].id); obrigatório com várias opções'),
    eatenAt: z.string().optional().describe('Quando comeu, ISO 8601 com offset; default agora'),
  } as const;
  execute(
    input: { planMealId: string; optionId?: string; eatenAt?: string },
    { userId, timezone }: McpToolContext,
  ) {
    return this.plans.logMeal(
      userId,
      input.planMealId,
      { optionId: input.optionId, eatenAt: input.eatenAt },
      timezone,
    );
  }
}
