import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { TrainingBlockService } from '../training-block.service';

@Injectable()
@McpTool()
export class CreateTrainingBlockTool implements McpToolDef {
  constructor(private readonly blocks: TrainingBlockService) {}

  readonly name = 'create_training_block';

  readonly title = 'Montar bloco de periodização';

  readonly annotations = { readOnlyHint: false, destructiveHint: false };

  readonly hostedInference = false;
  readonly description =
    'Monta um bloco de periodização de 4 semanas (3 de acúmulo/pico + 1 de deload) a partir da segunda-feira desta semana. Os fatores de cada semana multiplicam a prescrição de carga, nunca uma carga absoluta. Só pode haver um bloco ativo por vez — se já houver um em andamento, encerre-o antes. ' +
    'Exemplo: {"planId":"3f7c1c2e-9a4b-4b1e-8f0d-2c5a6b7d8e90","kind":"hypertrophy","sessionsPerWeek":4}';
  readonly inputSchema = {
    planId: z
      .string()
      .uuid()
      .optional()
      .describe('ID do plano de treino que o bloco periodiza. Ausente = treino livre'),
    kind: z
      .enum(['strength', 'hypertrophy'])
      .optional()
      .describe(
        'Tipo do bloco: "strength" (4-6 reps) ou "hypertrophy" (8-12 reps). Padrão: hypertrophy',
      ),
    sessionsPerWeek: z
      .number()
      .int()
      .min(1)
      .max(7)
      .optional()
      .describe('Meta de sessões por semana. Ausente = a meta semanal já cadastrada nas metas'),
  } as const;

  execute(
    input: { planId?: string; kind?: 'strength' | 'hypertrophy'; sessionsPerWeek?: number },
    { userId, timezone }: McpToolContext,
  ) {
    return this.blocks.create({ userId, timezone }, input);
  }
}
