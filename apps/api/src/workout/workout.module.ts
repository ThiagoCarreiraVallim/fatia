import { Module } from '@nestjs/common';
import { ExerciseService } from './exercise.service';
import { WorkoutPlanService } from './workout-plan.service';
import { WorkoutSessionService } from './workout-session.service';
import { SessionSetService } from './session-set.service';
import { WorkoutController } from './workout.controller';
import { AddExerciseToPlanTool } from './mcp/add-exercise-to-plan.tool';
import { CreateCustomExerciseTool } from './mcp/create-custom-exercise.tool';
import { CreateWorkoutPlanTool } from './mcp/create-workout-plan.tool';
import { DeleteCustomExerciseTool } from './mcp/delete-custom-exercise.tool';
import { DeleteSetTool } from './mcp/delete-set.tool';
import { DeleteWorkoutPlanTool } from './mcp/delete-workout-plan.tool';
import { DeleteWorkoutSessionTool } from './mcp/delete-workout-session.tool';
import { FinishWorkoutSessionTool } from './mcp/finish-workout-session.tool';
import { GetActiveWorkoutSessionTool } from './mcp/get-active-workout-session.tool';
import { GetLastSetForExerciseTool } from './mcp/get-last-set-for-exercise.tool';
import { GetPersonalRecordTool } from './mcp/get-personal-record.tool';
import { GetWorkoutPlanTool } from './mcp/get-workout-plan.tool';
import { GetWorkoutSessionTool } from './mcp/get-workout-session.tool';
import { ListExercisesByMuscleTool } from './mcp/list-exercises-by-muscle.tool';
import { ListPersonalRecordsTool } from './mcp/list-personal-records.tool';
import { ListWorkoutPlansTool } from './mcp/list-workout-plans.tool';
import { ListWorkoutSessionsTool } from './mcp/list-workout-sessions.tool';
import { LogSetTool } from './mcp/log-set.tool';
import { RemoveExerciseFromPlanTool } from './mcp/remove-exercise-from-plan.tool';
import { ReorderPlanExercisesTool } from './mcp/reorder-plan-exercises.tool';
import { SearchExerciseTool } from './mcp/search-exercise.tool';
import { StartWorkoutSessionTool } from './mcp/start-workout-session.tool';
import { UpdateCustomExerciseTool } from './mcp/update-custom-exercise.tool';
import { UpdatePlanExerciseTool } from './mcp/update-plan-exercise.tool';
import { UpdateSetTool } from './mcp/update-set.tool';
import { UpdateWorkoutPlanTool } from './mcp/update-workout-plan.tool';

@Module({
  controllers: [WorkoutController],
  providers: [
    ExerciseService,
    WorkoutPlanService,
    WorkoutSessionService,
    SessionSetService,

    // MCP tools
    AddExerciseToPlanTool,
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
    ListPersonalRecordsTool,
    ListWorkoutPlansTool,
    ListWorkoutSessionsTool,
    LogSetTool,
    RemoveExerciseFromPlanTool,
    ReorderPlanExercisesTool,
    SearchExerciseTool,
    StartWorkoutSessionTool,
    UpdateCustomExerciseTool,
    UpdatePlanExerciseTool,
    UpdateSetTool,
    UpdateWorkoutPlanTool,
  ],
  exports: [ExerciseService, WorkoutPlanService, WorkoutSessionService, SessionSetService],
})
export class WorkoutModule {}
