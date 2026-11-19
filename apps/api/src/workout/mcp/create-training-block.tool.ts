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

  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };

  readonly hostedInference = false;

  readonly card = 'confirm' as const;
  readonly aiCategory = 'WORKOUT' as const;
  readonly description =
    'Monta um bloco de periodização de 3 a 6 semanas (4 por padrão): acúmulo, depois pico, e a última de deload, a partir da segunda-feira desta semana (ou da próxima). Os fatores de cada semana multiplicam a prescrição de carga, nunca uma carga absoluta. Só pode haver um bloco ativo por vez — se já houver um em andamento, encerre-o antes. ' +
    'Exemplo: {"planId":"3f7c1c2e-9a4b-4b1e-8f0d-2c5a6b7d8e90","kind":"hypertrophy","sessionsPerWeek":4,"weeks":6}';
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
    weeks: z
      .number()
      .int()
      .min(3)
      .max(6)
      .optional()
      .describe('Quantas semanas, de 3 a 6; a última é deload. Padrão: 4'),
  } as const;

  execute(
    input: {
      planId?: string;
      kind?: 'strength' | 'hypertrophy';
      sessionsPerWeek?: number;
      weeks?: number;
    },
    { userId, timezone }: McpToolContext,
  ) {
    return this.blocks.create({ userId, timezone }, input);
  }
}
