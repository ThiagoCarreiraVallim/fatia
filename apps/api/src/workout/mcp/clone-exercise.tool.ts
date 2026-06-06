import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { ExerciseService } from '../exercise.service';
import { muscleGroupSchema, muscleListSchema } from '../helpers/muscle-group';

@Injectable()
@McpTool()
export class CloneExerciseTool implements McpToolDef {
  constructor(private readonly exercises: ExerciseService) {}

  readonly name = 'clone_exercise';
  readonly description =
    'Cria (ou reaproveita) uma CÓPIA editável de um exercício base para o usuário, já que ' +
    'exercícios base são só-leitura. A partir daí a base some das listagens do usuário e ' +
    'aparece a cópia. Aceita overrides opcionais para já editar no mesmo passo. ' +
    'primaryMuscles/secondaryMuscles devem ficar em inglês (chaves das cores).';
  readonly inputSchema = {
    id: z.number().int().describe('ID do exercício base a copiar'),
    name: z.string().max(200).optional(),
    muscleGroup: muscleGroupSchema.optional(),
    primaryMuscles: muscleListSchema.optional(),
    secondaryMuscles: muscleListSchema.optional(),
    equipment: z.string().max(100).optional(),
    level: z.string().max(50).optional(),
    mechanic: z.string().max(50).optional(),
    instructions: z.array(z.string().max(2000)).optional(),
    youtubeVideoId: z.string().max(40).optional(),
    youtubeVideoIdPt: z.string().max(40).optional(),
  } as const;

  execute(
    { id, ...overrides }: { id: number } & Record<string, unknown>,
    { userId }: McpToolContext,
  ) {
    return this.exercises.cloneForEdit(userId, id, overrides);
  }
}
