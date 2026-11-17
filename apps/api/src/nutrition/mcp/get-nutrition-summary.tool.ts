import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { NutritionSummaryService } from '../nutrition-summary.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetNutritionSummaryTool implements McpToolDef {
  constructor(private readonly summary: NutritionSummaryService) {}
  readonly name = 'get_nutrition_summary';
  readonly title = 'Resumo nutricional do dia';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'metric' as const;
  readonly description = 'Resumo nutricional do dia (totais + refeições).';
  readonly inputSchema = { date: z.string().describe('YYYY-MM-DD') } as const;
  execute({ date }: { date: string }, { userId, timezone }: McpToolContext) {
    return this.summary.getDay(userId, date, timezone);
  }

  /** O total do dia e os três macros, como o cartão de hoje (`get_today_summary`). */
  artifact(result: unknown) {
    const dia = result as Awaited<ReturnType<NutritionSummaryService['getDay']>>;
    return {
      kind: 'metric',
      label: 'Calorias do dia',
      value: Math.round(dia.totals.kcal),
      unit: 'kcal',
      breakdown: [
        { label: 'Proteína', value: Math.round(dia.totals.proteinG), unit: 'g' },
        { label: 'Carboidrato', value: Math.round(dia.totals.carbsG), unit: 'g' },
        { label: 'Gordura', value: Math.round(dia.totals.fatG), unit: 'g' },
      ],
    };
  }
}
