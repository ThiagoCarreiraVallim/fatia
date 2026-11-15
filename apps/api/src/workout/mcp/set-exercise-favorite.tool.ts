import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { ExerciseService } from '../exercise.service';

/** Espelho de `set_food_favorite` para exercício (#378). */
@Injectable()
@McpTool()
export class SetExerciseFavoriteTool implements McpToolDef {
  constructor(private readonly exercises: ExerciseService) {}
  readonly name = 'set_exercise_favorite';
  readonly title = 'Favoritar exercício';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    'Marca ou desmarca um exercício como favorito; favoritos aparecem primeiro na busca do app e em ' +
    'search_exercise com favoritesOnly. Exemplo: {"id":42,"favorite":true}';
  readonly inputSchema = {
    id: z.number().int().positive().describe('ID do exercício, obtido via search_exercise'),
    favorite: z.boolean().describe('true marca, false desmarca'),
  } as const;
  async execute({ id, favorite }: { id: number; favorite: boolean }, { userId }: McpToolContext) {
    await this.exercises.setFavorite(userId, id, favorite);
    return { id, favorite };
  }
}
