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
export class DeleteCustomExerciseTool implements McpToolDef {
  constructor(private readonly exercises: ExerciseService) {}

  readonly name = 'delete_custom_exercise';
  readonly description =
    'Remove um exercício custom do usuário. Falha se há sets registrados com esse exercício.';
  readonly inputSchema = {
    id: z.number().int().describe('ID do exercício custom a remover'),
  } as const;

  async execute({ id }: { id: number }, { userId }: McpToolContext) {
    await this.exercises.deleteCustom(userId, id);
    return { deleted: true };
  }
}
