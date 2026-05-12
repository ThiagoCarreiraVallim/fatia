import { Module } from '@nestjs/common';
import { NutritionModule } from '../nutrition/nutrition.module';
import { WorkoutModule } from '../workout/workout.module';
import { ProgressModule } from '../progress/progress.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { GetTodaySummaryTool } from './mcp/get-today-summary.tool';
import { GetWeekSummaryTool } from './mcp/get-week-summary.tool';

@Module({
  imports: [NutritionModule, WorkoutModule, ProgressModule],
  controllers: [DashboardController],
  providers: [DashboardService, GetTodaySummaryTool, GetWeekSummaryTool],
  exports: [DashboardService],
})
export class DashboardModule {}
