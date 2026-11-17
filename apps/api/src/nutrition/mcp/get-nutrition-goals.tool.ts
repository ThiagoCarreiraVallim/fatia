import { Injectable } from '@nestjs/common';
import { UserGoalsService } from '../user-goals.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { rangeCenter } from '../../mcp/card-format';

@Injectable()
@McpTool()
export class GetNutritionGoalsTool implements McpToolDef {
  constructor(private readonly goals: UserGoalsService) {}
  readonly name = 'get_nutrition_goals';
  readonly title = 'Ver metas nutricionais';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'range' as const;
  readonly description = 'Retorna as metas nutricionais do usuário.';
  readonly inputSchema = {} as const;
  execute(_input: unknown, { userId }: McpToolContext) {
    return this.goals.get(userId);
  }

  /**
   * A faixa de calorias e de cada macro (prancha IA-Cartoes, #384). Sem consumo para marcar,
   * o ponto fica no meio da faixa. Sem metas cadastradas, não há cartão.
   */
  artifact(result: unknown) {
    const metas = result as Awaited<ReturnType<UserGoalsService['get']>>;
    if (!metas) return null;
    const linha = (label: string, min: number, max: number, unit: string) => ({
      label,
      value: rangeCenter(min, max) ?? min,
      min,
      max,
      unit,
    });
    return {
      kind: 'range',
      label: 'Metas do dia',
      rows: [
        linha('Calorias', metas.kcalMin, metas.kcalMax, 'kcal'),
        linha('Proteína', metas.proteinMinG, metas.proteinMaxG, 'g'),
        linha('Carboidratos', metas.carbsMinG, metas.carbsMaxG, 'g'),
        linha('Gordura', metas.fatMinG, metas.fatMaxG, 'g'),
      ],
    };
  }
}
