import { Injectable } from '@nestjs/common';
import { DashboardService } from '../dashboard.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetWeekSummaryTool implements McpToolDef {
  constructor(private readonly dashboard: DashboardService) {}
  readonly name = 'get_week_summary';
  readonly description = 'Resumo da semana corrente: nutrição, treinos, cardio, passos, peso.';
  readonly inputSchema = {} as const;
  execute(_input: Record<string, never>, { userId, timezone }: McpToolContext) {
    return this.dashboard.week({ userId, timezone });
  }
}
