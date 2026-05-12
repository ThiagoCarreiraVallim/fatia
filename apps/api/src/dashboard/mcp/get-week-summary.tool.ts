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
export class GetWeekSummaryTool implements McpToolDef {
  constructor(private readonly dashboard: DashboardService) {}

  readonly name = 'get_week_summary';
  readonly description =
    "Returns this week's summary including nutrition averages, workout totals (including cardio), and steps. Useful for weekly progress reviews.";
  readonly inputSchema = {
    timezone: z.string().optional().default('UTC'),
  } as const;

  execute(input: { timezone?: string }, { userId }: McpToolContext) {
    return this.dashboard.week(userId, input.timezone ?? 'UTC');
  }
}
