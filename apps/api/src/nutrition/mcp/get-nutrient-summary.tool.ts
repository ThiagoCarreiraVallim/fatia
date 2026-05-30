import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { NutrientTargetService } from '../nutrient-target.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetNutrientSummaryTool implements McpToolDef {
  constructor(private readonly targets: NutrientTargetService) {}
  readonly name = 'get_nutrient_summary';
  readonly description =
    'Resumo do dia para as metas de nutrientes personalizadas: total consumido por nutriente e status (under/ok/over) vs. min/max.';
  readonly inputSchema = {
    date: z.string().describe('YYYY-MM-DD'),
  } as const;
  execute(input: { date: string }, { userId, timezone }: McpToolContext) {
    return this.targets.getNutrientSummary(userId, input.date, timezone);
  }
}
