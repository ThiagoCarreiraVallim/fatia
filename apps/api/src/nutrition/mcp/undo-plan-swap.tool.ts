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
export class UndoPlanSwapTool implements McpToolDef {
  constructor(private readonly plans: NutritionPlanService) {}
  readonly name = 'undo_plan_swap';
  readonly title = 'Desfazer troca do plano';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly card = 'confirm' as const;
  readonly description =
    'Desfaz uma troca do plano alimentar: volta ao item do plano, inclusive no diário. A troca ' +
    'fica registrada como desfeita. ' +
    'Exemplo: {"swapId":"11111111-2222-4333-8444-555555555555"}';
  readonly inputSchema = {
    swapId: z.string().uuid().describe('ID da troca (items[].swap.id em get_nutrition_plan)'),
  } as const;
  execute(input: { swapId: string }, { userId }: McpToolContext) {
    return this.plans.undoSwap(userId, input.swapId);
  }
}
