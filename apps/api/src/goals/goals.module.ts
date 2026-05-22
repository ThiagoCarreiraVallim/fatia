import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ProgressModule } from '../progress/progress.module';
import { GoalsService } from './goals.service';
import { GoalsController } from './goals.controller';
import { CreateGoalTool } from './mcp/create-goal.tool';
import { ListGoalsTool } from './mcp/list-goals.tool';
import { GetGoalTool } from './mcp/get-goal.tool';
import { UpdateGoalTool } from './mcp/update-goal.tool';
import { CompleteGoalTool } from './mcp/complete-goal.tool';
import { DeleteGoalTool } from './mcp/delete-goal.tool';

@Module({
  imports: [CommonModule, ProgressModule],
  controllers: [GoalsController],
  providers: [
    GoalsService,
    CreateGoalTool,
    ListGoalsTool,
    GetGoalTool,
    UpdateGoalTool,
    CompleteGoalTool,
    DeleteGoalTool,
  ],
  exports: [GoalsService],
})
export class GoalsModule {}
