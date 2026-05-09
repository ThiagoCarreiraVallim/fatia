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
export class UpdateCustomExerciseTool implements McpToolDef {
  constructor(private readonly exercises: ExerciseService) {}

  readonly name = 'update_custom_exercise';
  readonly description = 'Atualiza nome ou grupo muscular de um exercício custom do usuário.';
  readonly inputSchema = {
    id: z.number().int().describe('ID do exercício'),
    name: z.string().max(200).optional(),
    muscleGroup: z
      .enum(['peito', 'costas', 'pernas', 'ombro', 'braço', 'core', 'cardio'])
      .optional(),
  } as const;

  execute(
    { id, ...dto }: { id: number; name?: string; muscleGroup?: string },
    { userId }: McpToolContext,
  ) {
    return this.exercises.updateCustom(userId, id, dto);
  }
}
