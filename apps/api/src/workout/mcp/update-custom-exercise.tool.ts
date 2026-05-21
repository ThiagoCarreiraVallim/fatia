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
export class UpdateCustomExerciseTool implements McpToolDef {
  constructor(private readonly exercises: ExerciseService) {}

  readonly name = 'update_custom_exercise';
  readonly description = "Updates the name or muscle group of a user's custom exercise.";
  readonly inputSchema = {
    id: z.number().int().describe('ID of the exercise'),
    name: z.string().max(200).optional(),
    muscleGroup: muscleGroupSchema
      .optional()
      .describe(
        'Muscle group. Common: chest, back, legs, shoulder, arm, core, cardio. ' +
          'Accepts other names (up to 50 chars, letters/spaces/hyphens) — normalized to lowercase.',
      ),
  } as const;

  execute(
    { id, ...dto }: { id: number; name?: string; muscleGroup?: string },
    { userId }: McpToolContext,
  ) {
    return this.exercises.updateCustom(userId, id, dto);
  }
}
