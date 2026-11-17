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
export class SearchExerciseTool implements McpToolDef {
  constructor(private readonly exercises: ExerciseService) {}

  readonly name = 'search_exercise';

  readonly title = 'Buscar exercício';

  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };

  readonly hostedInference = false;
  readonly card = 'report' as const;
  readonly description =
    "Search for exercises by name or muscle group (chest, back, legs, shoulders, arms, core, cardio). Favorites come first (favorite: true), then exercises from the user's community (gym or creator), marked with communityName.";
  readonly inputSchema = {
    q: z.string().optional().describe('Search term (exercise name)'),
    muscleGroup: muscleGroupSchema
      .optional()
      .describe(
        'Filter by muscle group. Common: chest | back | legs | shoulder | arm | core | cardio',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results (default 20)'),
    onlyMyGym: z
      .boolean()
      .optional()
      .describe("Only the community's own exercises and those its equipment allows"),
    favoritesOnly: z
      .boolean()
      .optional()
      .describe("Only the user's favorite exercises (set_exercise_favorite)"),
  } as const;

  execute(
    input: {
      q?: string;
      muscleGroup?: string;
      limit?: number;
      onlyMyGym?: boolean;
      favoritesOnly?: boolean;
    },
    { userId }: McpToolContext,
  ) {
    return this.exercises.search(userId, input);
  }

  /** Os exercícios achados, com o grupo muscular: é por ele que a pessoa escolhe. */
  artifact(result: unknown) {
    const exercicios = result as Awaited<ReturnType<ExerciseService['search']>>;
    return {
      kind: 'report',
      label: 'Exercícios encontrados',
      columns: ['Exercício', 'Grupo'],
      rows: exercicios.map((exercicio) => [exercicio.name, exercicio.muscleGroup]),
    };
  }
}
