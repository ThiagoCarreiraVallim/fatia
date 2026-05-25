import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { NutritionModule } from '../nutrition/nutrition.module';
import { ProgressModule } from '../progress/progress.module';
import { WorkoutModule } from '../workout/workout.module';
import { GoalsModule } from '../goals/goals.module';
import { McpController } from './mcp.controller';
import { McpThrottlerGuard } from './mcp-throttler.guard';
import { McpToolRegistry } from './mcp-tool.registry';
import { GetMeTool } from './tools/meta/get-me.tool';
import { UpdateTimezoneTool } from './tools/meta/update-timezone.tool';
import { UpdateMeTool } from './tools/meta/update-me.tool';

@Module({
  imports: [DiscoveryModule, NutritionModule, ProgressModule, WorkoutModule, GoalsModule],
  controllers: [McpController],
  providers: [McpThrottlerGuard, McpToolRegistry, GetMeTool, UpdateTimezoneTool, UpdateMeTool],
})
export class McpModule {}
