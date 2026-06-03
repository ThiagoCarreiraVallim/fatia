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
export class ExplainFormTool implements McpToolDef {
  constructor(private readonly exercises: ExerciseService) {}

  readonly name = 'explain_form';
  readonly description =
    'Returns step-by-step instructions and technique details for an exercise by name. Use the returned instructions to explain proper form to the user.';
  readonly inputSchema = {
    exerciseName: z.string().min(2).describe('Name of the exercise (partial match supported)'),
  } as const;

  async execute(input: { exerciseName: string }, { userId }: McpToolContext) {
    const matches = await this.exercises.findByName(userId, input.exerciseName);
    return matches.map((ex) => ({
      id: ex.id,
      name: ex.name,
      primaryMuscles: ex.primaryMuscles,
      secondaryMuscles: ex.secondaryMuscles,
      equipment: ex.equipment,
      level: ex.level,
      mechanic: ex.mechanic,
      instructions: ex.instructions,
    }));
  }
}
