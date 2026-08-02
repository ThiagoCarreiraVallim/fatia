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

  readonly title = 'Ver detalhes do exercício';

  readonly annotations = { readOnlyHint: true, destructiveHint: false };

  readonly hostedInference = false;
  readonly description =
    'Retorna os detalhes completos de um exercício: nome, músculos primários e secundários, equipamento, nível, mecânica e passos de execução. Use quando já tiver o ID; para buscar por nome, use search_exercise ou explain_form.';
  readonly inputSchema = {
    exerciseId: z
      .number()
      .int()
      .positive()
      .describe('ID numérico do exercício, obtido via search_exercise'),
  } as const;

  execute(input: { exerciseId: number }, { userId }: McpToolContext) {
    return this.exercises.get(userId, input.exerciseId);
  }
}
