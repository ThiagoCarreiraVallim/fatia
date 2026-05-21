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
  readonly description = 'Resumo nutricional do dia (totais + refeições).';
  readonly inputSchema = { date: z.string().describe('YYYY-MM-DD') } as const;
  execute({ date }: { date: string }, { userId, timezone }: McpToolContext) {
    return this.summary.getDay(userId, date, timezone);
  }
}
