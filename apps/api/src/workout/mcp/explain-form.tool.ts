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

  readonly annotations = { readOnlyHint: true, destructiveHint: false };

  readonly hostedInference = false;
  readonly description =
    'Retorna os passos de execução e detalhes de técnica de um exercício buscado por nome. Use quando o usuário perguntar "como faz" ou pedir ajuda com a forma — as instruções retornadas são o insumo para explicar a execução correta.';
  readonly inputSchema = {
    exerciseName: z
      .string()
      .min(2)
      .describe('Nome do exercício — busca parcial é suportada (ex.: "supino")'),
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
