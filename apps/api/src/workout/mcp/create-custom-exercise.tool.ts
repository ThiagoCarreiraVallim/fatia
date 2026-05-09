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
export class CreateCustomExerciseTool implements McpToolDef {
  constructor(private readonly exercises: ExerciseService) {}

  readonly name = 'create_custom_exercise';
  readonly description = 'Cria um exercício personalizado para o usuário.';
  readonly inputSchema = {
    name: z.string().max(200).describe('Nome do exercício'),
    muscleGroup: z.enum(['peito', 'costas', 'pernas', 'ombro', 'braço', 'core', 'cardio']),
  } as const;

  execute(input: { name: string; muscleGroup: string }, { userId }: McpToolContext) {
    return this.exercises.createCustom(userId, input);
  }
}
