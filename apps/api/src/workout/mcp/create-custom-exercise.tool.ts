import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { ExerciseService } from '../exercise.service';
import { muscleGroupSchema } from '../helpers/muscle-group';

@Injectable()
@McpTool()
export class CreateCustomExerciseTool implements McpToolDef {
  constructor(private readonly exercises: ExerciseService) {}

  readonly name = 'create_custom_exercise';
  readonly description = 'Creates a custom exercise for the user.';
  readonly inputSchema = {
    name: z.string().max(200).describe('Name of the exercise'),
    muscleGroup: muscleGroupSchema.describe(
      'Muscle group. Common: chest, back, legs, shoulder, arm, core, cardio. ' +
        'Accepts other names (up to 50 chars, letters/spaces/hyphens) — normalized to lowercase.',
    ),
  } as const;

  execute(input: { name: string; muscleGroup: string }, { userId }: McpToolContext) {
    return this.exercises.createCustom(userId, input);
  }
}
