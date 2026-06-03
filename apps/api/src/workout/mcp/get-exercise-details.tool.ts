import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { ExerciseService } from '../exercise.service';

@Injectable()
@McpTool()
export class GetExerciseDetailsTool implements McpToolDef {
  constructor(private readonly exercises: ExerciseService) {}

  readonly name = 'get_exercise_details';
  readonly description =
    'Returns full details for an exercise: name, primary/secondary muscles, equipment, level, mechanic, and step-by-step instructions.';
  readonly inputSchema = {
    exerciseId: z.number().int().positive().describe('Numeric ID of the exercise'),
  } as const;

  execute(input: { exerciseId: number }, { userId }: McpToolContext) {
    return this.exercises.get(userId, input.exerciseId);
  }
}
