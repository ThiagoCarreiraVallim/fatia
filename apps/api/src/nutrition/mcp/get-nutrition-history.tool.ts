import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { NutritionSummaryService } from '../nutrition-summary.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { dayMonth } from '../../mcp/card-format';

@Injectable()
@McpTool()
export class GetNutritionHistoryTool implements McpToolDef {
  constructor(private readonly summary: NutritionSummaryService) {}
  readonly name = 'get_nutrition_history';
  readonly title = 'Histórico de nutrição';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'bars' as const;
  readonly description = 'Histórico dos últimos N dias com médias.';
  readonly inputSchema = {
    days: z
      .number()
      .int()
      .min(1)
      .max(90)
      .default(7)
      .describe('Quantos dias para trás incluir no histórico (default 7, máx 90)'),
  } as const;
  execute({ days }: { days: number }, { userId, timezone }: McpToolContext) {
    return this.summary.getHistory(userId, days, timezone);
  }

  /** As calorias de cada dia, com a média do período (prancha IA-Cartoes, #384). */
  artifact(result: unknown, input: { days: number }) {
    const historico = result as Awaited<ReturnType<NutritionSummaryService['getHistory']>>;
    return {
      kind: 'bars',
      label: `Calorias nos últimos ${input.days ?? historico.days} dias`,
      unit: 'kcal',
      average: Math.round(historico.averages.kcal),
      bars: historico.series.map((dia) => ({
        label: dayMonth(dia.date),
        value: Math.round(dia.kcal),
      })),
    };
  }
}
