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
export class UpdateCustomExerciseTool implements McpToolDef {
  constructor(private readonly exercises: ExerciseService) {}

  readonly name = 'update_custom_exercise';
  readonly description =
    "Updates/enriches an exercise (the user's custom one OR a catalog exercise). " +
    'Use it to translate content to Portuguese (name, equipment, instructions) and to add ' +
    'details (level, mechanic, video). IMPORTANT: primaryMuscles/secondaryMuscles MUST stay ' +
    'in English — they are the keys that drive the muscle-diagram colors.';
  readonly inputSchema = {
    id: z.number().int().describe('ID of the exercise'),
    name: z.string().max(200).optional().describe('Nome (pode/deve ser em português)'),
    muscleGroup: muscleGroupSchema
      .optional()
      .describe('Grupo (pt): peito, costas, pernas, ombro, braço, core, cardio.'),
    primaryMuscles: muscleListSchema.optional(),
    secondaryMuscles: muscleListSchema.optional(),
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
    youtubeVideoId: z.string().max(40).optional(),
    youtubeVideoIdPt: z.string().max(40).optional(),
  } as const;

  execute({ id, ...dto }: { id: number } & Record<string, unknown>, { userId }: McpToolContext) {
    return this.exercises.updateCustom(userId, id, dto);
  }
}
