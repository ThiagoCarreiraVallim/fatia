import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { NutritionSummaryService } from '../nutrition-summary.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class GetNutritionHistoryTool implements McpToolDef {
  constructor(private readonly summary: NutritionSummaryService) {}
  readonly name = 'get_nutrition_history';
  readonly description = 'Histórico dos últimos N dias com médias.';
  readonly inputSchema = { days: z.number().int().min(1).max(90).default(7) } as const;
  execute({ days }: { days: number }, { userId }: McpToolContext) {
    return this.summary.getHistory(userId, days);
  }
}
