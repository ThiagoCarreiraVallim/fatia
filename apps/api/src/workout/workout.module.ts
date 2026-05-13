import { Module } from '@nestjs/common';
import { ExerciseService } from './exercise.service';
import { WorkoutPlanService } from './workout-plan.service';
import { WorkoutSessionService } from './workout-session.service';
import { SessionSetService } from './session-set.service';
import { SearchExerciseTool } from './mcp/search-exercise.tool';
import { ListExercisesByMuscleTool } from './mcp/list-exercises-by-muscle.tool';
import { CreateCustomExerciseTool } from './mcp/create-custom-exercise.tool';
import { UpdateCustomExerciseTool } from './mcp/update-custom-exercise.tool';
import { DeleteCustomExerciseTool } from './mcp/delete-custom-exercise.tool';
import { CreateWorkoutPlanTool } from './mcp/create-workout-plan.tool';
import { DeleteWorkoutPlanTool } from './mcp/delete-workout-plan.tool';
import { DeleteSetTool } from './mcp/delete-set.tool';
import { DeleteWorkoutSessionTool } from './mcp/delete-workout-session.tool';
import { FinishWorkoutSessionTool } from './mcp/finish-workout-session.tool';
import { GetActiveWorkoutSessionTool } from './mcp/get-active-workout-session.tool';
import { GetLastSetForExerciseTool } from './mcp/get-last-set-for-exercise.tool';
import { GetPersonalRecordTool } from './mcp/get-personal-record.tool';
import { GetWorkoutPlanTool } from './mcp/get-workout-plan.tool';
import { GetWorkoutSessionTool } from './mcp/get-workout-session.tool';
import { ListWorkoutPlansTool } from './mcp/list-workout-plans.tool';
import { ListWorkoutSessionsTool } from './mcp/list-workout-sessions.tool';
import { LogSetTool } from './mcp/log-set.tool';
import { StartWorkoutSessionTool } from './mcp/start-workout-session.tool';
import { UpdateSetTool } from './mcp/update-set.tool';
import { UpdateWorkoutPlanTool } from './mcp/update-workout-plan.tool';

@Module({
  providers: [
    ExerciseService,
    WorkoutPlanService,
    WorkoutSessionService,
    SessionSetService,

    // MCP tools
    CreateCustomExerciseTool,
    CreateWorkoutPlanTool,
    DeleteCustomExerciseTool,
    DeleteSetTool,
    DeleteWorkoutPlanTool,
    DeleteWorkoutSessionTool,
    FinishWorkoutSessionTool,
    GetActiveWorkoutSessionTool,
    GetLastSetForExerciseTool,
    GetPersonalRecordTool,
    GetWorkoutPlanTool,
    GetWorkoutSessionTool,
    ListExercisesByMuscleTool,
    ListWorkoutPlansTool,
    ListWorkoutSessionsTool,
    LogSetTool,
    SearchExerciseTool,
    StartWorkoutSessionTool,
    UpdateCustomExerciseTool,
    UpdateSetTool,
    UpdateWorkoutPlanTool,
  ],
  exports: [ExerciseService, WorkoutPlanService, WorkoutSessionService, SessionSetService],
})
export class WorkoutModule {}
