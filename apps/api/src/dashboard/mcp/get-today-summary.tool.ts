import { Injectable } from '@nestjs/common';
import { z } from 'zod';
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
    "Returns today's summary including nutrition totals, workout status, weight, and steps. Call this to get an overview of the user's day.";
  readonly inputSchema = {
    timezone: z.string().optional().default('UTC'),
  } as const;

  execute(input: { timezone?: string }, { userId }: McpToolContext) {
    return this.dashboard.today(userId, input.timezone ?? 'UTC');
  }
}
