import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { NutrientTargetService } from '../nutrient-target.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { dayMonth } from '../../mcp/card-format';

@Injectable()
@McpTool()
export class GetNutrientSummaryTool implements McpToolDef {
  constructor(private readonly targets: NutrientTargetService) {}
  readonly name = 'get_nutrient_summary';
  readonly title = 'Resumo de nutrientes do dia';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'range' as const;
  readonly description =
    'Resumo do dia para as metas de nutrientes personalizadas: total consumido por nutriente e status (under/ok/over) vs. min/max.';
  readonly inputSchema = {
    date: z.string().describe('YYYY-MM-DD'),
  } as const;
  execute(input: { date: string }, { userId, timezone }: McpToolContext) {
    return this.targets.getNutrientSummary(userId, input.date, timezone);
  }

  /** O total de cada nutriente do dia dentro da faixa da pessoa (prancha IA-Cartoes, #384). */
  artifact(result: unknown) {
    const resumo = result as Awaited<ReturnType<NutrientTargetService['getNutrientSummary']>>;
    return {
      kind: 'range',
      label: `Nutrientes em ${dayMonth(resumo.date)}`,
      rows: resumo.nutrients.map((n) => ({
        label: n.label,
        value: Math.round(n.total * 10) / 10,
        min: n.min,
        max: n.max,
        unit: n.unit,
      })),
    };
  }
}
