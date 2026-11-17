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
export class AcceptNutritionPlanTool implements McpToolDef {
  constructor(private readonly plans: NutritionPlanService) {}
  readonly name = 'accept_nutrition_plan';
  readonly title = 'Aceitar o plano alimentar';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly card = 'confirm' as const;
  readonly description =
    'Aceita o plano alimentar que espera aceite (pending em get_nutrition_plan). O plano em uso é ' +
    'substituído, as faixas do plano viram as metas do dia (quando applyGoals) e cada opção vira ' +
    'uma refeição salva. Confirme com o usuário antes: as metas dele mudam. ' +
    'Exemplo: {"planId":"11111111-2222-4333-8444-555555555555"}';
  readonly inputSchema = {
    planId: z.string().uuid().describe('ID do plano pendente (pending.id)'),
  } as const;
  execute(input: { planId: string }, { userId }: McpToolContext) {
    return this.plans.accept(userId, input.planId);
  }
}
