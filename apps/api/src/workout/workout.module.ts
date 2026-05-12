import { Module } from '@nestjs/common';
import { WorkoutController } from './workout.controller';
import { ExerciseService } from './exercise.service';
import { WorkoutPlanService } from './workout-plan.service';
import { WorkoutSessionService } from './workout-session.service';
import { SessionSetService } from './session-set.service';
// Exercise MCP tools
import { SearchExerciseTool } from './mcp/search-exercise.tool';
import { ListExercisesByMuscleTool } from './mcp/list-exercises-by-muscle.tool';
import { CreateCustomExerciseTool } from './mcp/create-custom-exercise.tool';
import { UpdateCustomExerciseTool } from './mcp/update-custom-exercise.tool';
import { DeleteCustomExerciseTool } from './mcp/delete-custom-exercise.tool';
// Plan MCP tools
import { CreateWorkoutPlanTool } from './mcp/create-workout-plan.tool';
import { ListWorkoutPlansTool } from './mcp/list-workout-plans.tool';
import { GetWorkoutPlanTool } from './mcp/get-workout-plan.tool';
import { UpdateWorkoutPlanTool } from './mcp/update-workout-plan.tool';
import { DeleteWorkoutPlanTool } from './mcp/delete-workout-plan.tool';
// Session MCP tools
import { StartWorkoutSessionTool } from './mcp/start-workout-session.tool';
import { GetActiveWorkoutSessionTool } from './mcp/get-active-workout-session.tool';
import { GetWorkoutSessionTool } from './mcp/get-workout-session.tool';
import { ListWorkoutSessionsTool } from './mcp/list-workout-sessions.tool';
import { FinishWorkoutSessionTool } from './mcp/finish-workout-session.tool';
import { DeleteWorkoutSessionTool } from './mcp/delete-workout-session.tool';
// Set MCP tools
import { LogSetTool } from './mcp/log-set.tool';
import { UpdateSetTool } from './mcp/update-set.tool';
import { DeleteSetTool } from './mcp/delete-set.tool';
import { GetLastSetForExerciseTool } from './mcp/get-last-set-for-exercise.tool';
import { GetPersonalRecordTool } from './mcp/get-personal-record.tool';

@Module({
  controllers: [WorkoutController],
  providers: [
    ExerciseService,
    WorkoutPlanService,
    WorkoutSessionService,
    SessionSetService,
    // MCP tools (auto-discovered by McpToolRegistry)
    SearchExerciseTool,
    ListExercisesByMuscleTool,
    CreateCustomExerciseTool,
    UpdateCustomExerciseTool,
    DeleteCustomExerciseTool,
    CreateWorkoutPlanTool,
    ListWorkoutPlansTool,
    GetWorkoutPlanTool,
    UpdateWorkoutPlanTool,
    DeleteWorkoutPlanTool,
    StartWorkoutSessionTool,
    GetActiveWorkoutSessionTool,
    GetWorkoutSessionTool,
    ListWorkoutSessionsTool,
    FinishWorkoutSessionTool,
    DeleteWorkoutSessionTool,
    LogSetTool,
    UpdateSetTool,
    DeleteSetTool,
    GetLastSetForExerciseTool,
    GetPersonalRecordTool,
  ],
  exports: [ExerciseService, WorkoutPlanService, WorkoutSessionService, SessionSetService],
})
export class WorkoutModule {}
