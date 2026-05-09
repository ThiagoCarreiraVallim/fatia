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
export class SearchExerciseTool implements McpToolDef {
  constructor(private readonly exercises: ExerciseService) {}

  readonly name = 'search_exercise';
  readonly description =
    'Busca exercícios por nome ou grupo muscular (peito, costas, pernas, ombro, braço, core, cardio).';
  readonly inputSchema = {
    q: z.string().optional().describe('Termo de busca (nome do exercício)'),
    muscleGroup: z
      .string()
      .optional()
      .describe('Filtrar por grupo: peito | costas | pernas | ombro | braço | core | cardio'),
    limit: z.number().int().min(1).max(50).optional().describe('Máximo de resultados (default 20)'),
  } as const;

  execute(input: { q?: string; muscleGroup?: string; limit?: number }, { userId }: McpToolContext) {
    return this.exercises.search(userId, input);
  }
}
