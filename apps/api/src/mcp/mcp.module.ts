import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { NutritionModule } from '../nutrition/nutrition.module';
import { ProgressModule } from '../progress/progress.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { McpController } from './mcp.controller';
import { McpTokensController } from './mcp-tokens.controller';
import { McpTokenService } from './mcp-token.service';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpThrottlerGuard } from './mcp-throttler.guard';
import { McpToolRegistry } from './mcp-tool.registry';
import { GetMeTool } from './tools/meta/get-me.tool';
import { UpdateTimezoneTool } from './tools/meta/update-timezone.tool';
import { ListMyTokensTool } from './tools/meta/list-my-tokens.tool';
import { RevokeTokenTool } from './tools/meta/revoke-token.tool';
import { LogWeightTool } from '../progress/mcp/log-weight.tool';
import { UpdateWeightLogTool } from '../progress/mcp/update-weight-log.tool';
import { DeleteWeightLogTool } from '../progress/mcp/delete-weight-log.tool';
import { ListWeightLogsTool } from '../progress/mcp/list-weight-logs.tool';
import { LogStepsTool } from '../progress/mcp/log-steps.tool';
import { UpdateStepLogTool } from '../progress/mcp/update-step-log.tool';
import { DeleteStepLogTool } from '../progress/mcp/delete-step-log.tool';
import { ListStepLogsTool } from '../progress/mcp/list-step-logs.tool';
import { GetStepsForDateTool } from '../progress/mcp/get-steps-for-date.tool';
import { GetStepsHistoryTool } from '../progress/mcp/get-steps-history.tool';
import { GetWeightProgressTool } from '../progress/mcp/get-weight-progress.tool';
import { GetStrengthProgressTool } from '../progress/mcp/get-strength-progress.tool';
import { GetCardioProgressTool } from '../progress/mcp/get-cardio-progress.tool';
import { GetVolumeProgressTool } from '../progress/mcp/get-volume-progress.tool';
import { GetStepsProgressTool } from '../progress/mcp/get-steps-progress.tool';
import { GetTodaySummaryTool } from '../dashboard/mcp/get-today-summary.tool';
import { GetWeekSummaryTool } from '../dashboard/mcp/get-week-summary.tool';

@Module({
  imports: [DiscoveryModule, NutritionModule, ProgressModule, DashboardModule],
  controllers: [McpController, McpTokensController],
  providers: [
    McpTokenService,
    McpAuthGuard,
    McpThrottlerGuard,
    McpToolRegistry,
    GetMeTool,
    UpdateTimezoneTool,
    ListMyTokensTool,
    RevokeTokenTool,
    LogWeightTool,
    UpdateWeightLogTool,
    DeleteWeightLogTool,
    ListWeightLogsTool,
    LogStepsTool,
    UpdateStepLogTool,
    DeleteStepLogTool,
    ListStepLogsTool,
    GetStepsForDateTool,
    GetStepsHistoryTool,
    GetWeightProgressTool,
    GetStrengthProgressTool,
    GetCardioProgressTool,
    GetVolumeProgressTool,
    GetStepsProgressTool,
    GetTodaySummaryTool,
    GetWeekSummaryTool,
  ],
})
export class McpModule {}
