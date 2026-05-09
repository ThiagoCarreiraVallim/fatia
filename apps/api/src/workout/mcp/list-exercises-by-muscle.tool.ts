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
export class ListExercisesByMuscleTool implements McpToolDef {
  constructor(private readonly exercises: ExerciseService) {}

  readonly name = 'list_exercises_by_muscle';
  readonly description = 'Lista todos os exercícios de um grupo muscular.';
  readonly inputSchema = {
    muscleGroup: z
      .string()
      .describe('Grupo muscular: peito | costas | pernas | ombro | braço | core | cardio'),
  } as const;

  execute({ muscleGroup }: { muscleGroup: string }, { userId }: McpToolContext) {
    return this.exercises.listByMuscle(userId, muscleGroup);
  }
}
