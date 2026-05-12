import { Module } from '@nestjs/common';
import { ExerciseService } from './exercise.service';
import { WorkoutSessionService } from './workout-session.service';
import { SessionSetService } from './session-set.service';
import { SearchExerciseTool } from './mcp/search-exercise.tool';
import { ListExercisesByMuscleTool } from './mcp/list-exercises-by-muscle.tool';
import { CreateCustomExerciseTool } from './mcp/create-custom-exercise.tool';
import { UpdateCustomExerciseTool } from './mcp/update-custom-exercise.tool';
import { DeleteCustomExerciseTool } from './mcp/delete-custom-exercise.tool';

@Module({
  providers: [
    ExerciseService,
    WorkoutSessionService,
    SessionSetService,
    SearchExerciseTool,
    ListExercisesByMuscleTool,
    CreateCustomExerciseTool,
    UpdateCustomExerciseTool,
    DeleteCustomExerciseTool,
  ],
  exports: [ExerciseService, WorkoutSessionService, SessionSetService],
})
export class WorkoutModule {}
