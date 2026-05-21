import { Injectable } from '@nestjs/common';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { ExerciseService } from '../exercise.service';
import { muscleGroupSchema } from '../helpers/muscle-group';

@Injectable()
@McpTool()
export class ListExercisesByMuscleTool implements McpToolDef {
  constructor(private readonly exercises: ExerciseService) {}

  readonly name = 'list_exercises_by_muscle';
  readonly description = 'Lists all exercises for a given muscle group.';
  readonly inputSchema = {
    muscleGroup: muscleGroupSchema.describe(
      'Muscle group. Common: chest, back, legs, shoulder, arm, core, cardio',
    ),
  } as const;

  execute({ muscleGroup }: { muscleGroup: string }, { userId }: McpToolContext) {
    return this.exercises.listByMuscle(userId, muscleGroup);
  }
}
