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

  readonly title = 'Explicar execução do exercício';

  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };

  readonly hostedInference = false;
  readonly card = 'instructions' as const;
  readonly description =
    'Retorna os passos de execução e detalhes de técnica de um exercício buscado por nome. Use quando o usuário perguntar "como faz" ou pedir ajuda com a forma — as instruções retornadas são o insumo para explicar a execução correta.';
  readonly inputSchema = {
    exerciseName: z
      .string()
      .min(2)
      .describe('Nome do exercício — busca parcial é suportada (ex.: "supino")'),
  } as const;

  execute(input: { exerciseName: string }, { userId }: McpToolContext) {
    return this.exercises.explainForm(userId, input.exerciseName);
  }

  /** Os passos do exercício achado (prancha IA-Cartoes, #384). Sem passos, sem cartão. */
  artifact(result: unknown) {
    const [exercicio] = result as { name: string; instructions: string[] }[];
    if (!exercicio?.instructions?.length) return null;
    return { kind: 'instructions', label: exercicio.name, steps: exercicio.instructions };
  }
}
