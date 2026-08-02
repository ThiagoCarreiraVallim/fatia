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

  readonly title = 'Duplicar exercício';

  readonly annotations = { readOnlyHint: false, destructiveHint: false };

  readonly hostedInference = false;
  readonly description =
    'Cria (ou reaproveita) uma CÓPIA editável de um exercício base para o usuário, já que ' +
    'exercícios base são só-leitura. A partir daí a base some das listagens do usuário e ' +
    'aparece a cópia. Aceita overrides opcionais para já editar no mesmo passo. ' +
    'primaryMuscles/secondaryMuscles devem ficar em inglês (chaves das cores). ' +
    'Exemplo: {"id":42,"name":"Supino reto com barra","muscleGroup":"peito","equipment":"barra","primaryMuscles":["chest"]}';
  readonly inputSchema = {
    id: z.number().int().describe('ID do exercício base a copiar'),
    name: z.string().max(200).optional().describe('Nome da cópia. Default: o nome do base'),
    muscleGroup: muscleGroupSchema
      .optional()
      .describe('Grupo (pt): peito, costas, pernas, ombro, braço, core, cardio'),
    primaryMuscles: muscleListSchema().optional(),
    secondaryMuscles: muscleListSchema().optional(),
    equipment: z
      .string()
      .max(100)
      .optional()
      .describe('Equipamento em português. Ex.: barra, halteres, máquina, peso corporal'),
    level: z.string().max(50).optional().describe('Nível: beginner | intermediate | advanced'),
    mechanic: z.string().max(50).optional().describe('Mecânica: compound | isolation'),
    instructions: z
      .array(z.string().max(2000))
      .optional()
      .describe('Passos de execução (pode/deve ser em português)'),
    youtubeVideoId: z.string().max(40).optional().describe('ID do vídeo do YouTube em inglês'),
    youtubeVideoIdPt: z.string().max(40).optional().describe('ID do vídeo do YouTube em português'),
  } as const;

  execute(
    { id, ...overrides }: { id: number } & Record<string, unknown>,
    { userId }: McpToolContext,
  ) {
    return this.exercises.cloneForEdit(userId, id, overrides);
  }
}
