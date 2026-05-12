import { Injectable } from '@nestjs/common';
import { DashboardService } from '../dashboard.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetTodaySummaryTool implements McpToolDef {
  constructor(private readonly dashboard: DashboardService) {}
  readonly name = 'get_today_summary';
  readonly description =
    'Resumo agregado de hoje: nutrição, treino, peso, passos e streaks. Reduz N chamadas a 1.';
  readonly inputSchema = {} as const;
  execute(_input: Record<string, never>, { userId, timezone }: McpToolContext) {
    return this.dashboard.today({ userId, timezone });
  }
}
