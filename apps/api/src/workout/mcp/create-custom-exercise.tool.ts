import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { ExerciseService } from '../exercise.service';
import { muscleGroupSchema } from '../helpers/muscle-group';

@Injectable()
@McpTool()
export class CreateCustomExerciseTool implements McpToolDef {
  constructor(private readonly exercises: ExerciseService) {}

  readonly name = 'create_custom_exercise';

  readonly title = 'Criar exercício personalizado';

  readonly annotations = { readOnlyHint: false, destructiveHint: false };
  readonly description =
    'Creates a custom exercise for the user. ' +
    'Exemplo: {"name":"Agachamento búlgaro com halteres","muscleGroup":"pernas"}';
  readonly inputSchema = {
    name: z.string().max(200).describe('Name of the exercise'),
    // Os canônicos são em português (`CANONICAL_MUSCLE_GROUPS`) — o texto em
    // inglês que estava aqui contradizia o exemplo da description, que usa
    // "pernas". Mesma redação do `clone_exercise`, que já estava certo.
    muscleGroup: muscleGroupSchema.describe(
      'Grupo (pt): peito, costas, pernas, ombro, braço, core, cardio. ' +
        'Aceita outros nomes (até 50 caracteres, letras/espaços/hifens) — normalizado para minúsculas.',
    ),
  } as const;

  execute(input: { name: string; muscleGroup: string }, { userId }: McpToolContext) {
    return this.exercises.createCustom(userId, input);
  }
}
