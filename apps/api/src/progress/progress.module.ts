import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { WeightLogService } from './weight-log.service';
import { StepLogService } from './step-log.service';
import { ProgressService } from './progress.service';
import { DashboardService } from './dashboard.service';
import { ProgressController } from './progress.controller';
import { LogWeightTool } from './mcp/log-weight.tool';
import { UpdateWeightLogTool } from './mcp/update-weight-log.tool';
import { DeleteWeightLogTool } from './mcp/delete-weight-log.tool';
import { ListWeightLogsTool } from './mcp/list-weight-logs.tool';
import { LogStepsTool } from './mcp/log-steps.tool';
import { UpdateStepLogTool } from './mcp/update-step-log.tool';
import { DeleteStepLogTool } from './mcp/delete-step-log.tool';
import { ListStepLogsTool } from './mcp/list-step-logs.tool';
import { GetStepsForDateTool } from './mcp/get-steps-for-date.tool';
import { GetStepsHistoryTool } from './mcp/get-steps-history.tool';
import { GetWeightProgressTool } from './mcp/get-weight-progress.tool';
import { GetStrengthProgressTool } from './mcp/get-strength-progress.tool';
import { GetCardioProgressTool } from './mcp/get-cardio-progress.tool';
import { GetVolumeProgressTool } from './mcp/get-volume-progress.tool';
import { GetStepsProgressTool } from './mcp/get-steps-progress.tool';
import { GetTodaySummaryTool } from './mcp/get-today-summary.tool';
import { GetWeekSummaryTool } from './mcp/get-week-summary.tool';

@Module({
  imports: [CommonModule],
  controllers: [ProgressController],
  providers: [
    WeightLogService,
    StepLogService,
    ProgressService,
    DashboardService,
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
  exports: [WeightLogService, StepLogService, ProgressService, DashboardService],
})
export class ProgressModule {}
