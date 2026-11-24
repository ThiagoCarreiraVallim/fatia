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
export class SwapPlanItemTool implements McpToolDef {
  constructor(private readonly plans: NutritionPlanService) {}
  readonly name = 'swap_plan_item';
  readonly title = 'Trocar item do plano';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly card = 'confirm' as const;
  readonly aiCategory = 'DAY_LOG' as const;
  readonly description =
    'Troca, num dia, um item do plano alimentar por um dos equivalentes que o profissional liberou ' +
    '(items[].equivalents em get_nutrition_plan), com a quantidade já ajustada. Se a refeição já ' +
    'foi registrada, o item do diário muda junto. teamSees diz se a equipe vê a troca. ' +
    'Exemplo: {"itemId":"11111111-2222-4333-8444-555555555555","equivalentId":"66666666-7777-4888-8999-000000000000"}';
  readonly inputSchema = {
    itemId: z.string().uuid().describe('ID do item do plano'),
    equivalentId: z.string().uuid().describe('ID de um equivalente desse item'),
    date: z.string().optional().describe('YYYY-MM-DD; default hoje no fuso do usuário'),
  } as const;
  execute(
    input: { itemId: string; equivalentId: string; date?: string },
    { userId, timezone }: McpToolContext,
  ) {
    return this.plans.swap(
      userId,
      { itemId: input.itemId, equivalentId: input.equivalentId, date: input.date },
      timezone,
    );
  }
}
