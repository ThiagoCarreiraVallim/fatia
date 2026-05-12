import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { SessionSetService } from '../session-set.service';

@Injectable()
@McpTool()
export class GetLastSetForExerciseTool implements McpToolDef {
  constructor(private readonly sets: SessionSetService) {}

  readonly name = 'get_last_set_for_exercise';
  readonly description =
    'Retorna a última série registrada para um exercício, útil para sugerir carga do próximo treino.';
  readonly inputSchema = {
    exerciseId: z.number().int().positive().describe('ID do exercício'),
    before: z
      .string()
      .optional()
      .describe('ISO8601 — retorna apenas séries de sessões anteriores a essa data'),
  } as const;

  execute(input: { exerciseId: number; before?: string }, { userId }: McpToolContext) {
    return this.sets.getLastForExercise(userId, input.exerciseId, input.before);
  }
}
