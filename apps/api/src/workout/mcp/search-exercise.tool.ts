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
export class SearchExerciseTool implements McpToolDef {
  constructor(private readonly exercises: ExerciseService) {}

  readonly name = 'search_exercise';
  readonly description =
    'Search for exercises by name or muscle group (chest, back, legs, shoulders, arms, core, cardio).';
  readonly inputSchema = {
    q: z.string().optional().describe('Search term (exercise name)'),
    muscleGroup: muscleGroupSchema
      .optional()
      .describe(
        'Filter by muscle group. Common: chest | back | legs | shoulder | arm | core | cardio',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results (default 20)'),
  } as const;

  execute(input: { q?: string; muscleGroup?: string; limit?: number }, { userId }: McpToolContext) {
    return this.exercises.search(userId, input);
  }
}
