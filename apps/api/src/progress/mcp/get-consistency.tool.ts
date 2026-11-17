import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ConsistencyService } from '../consistency.service';
import { CONSISTENCY_RANGES, type ConsistencyRange } from '../helpers/consistency';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetConsistencyTool implements McpToolDef {
  constructor(private readonly consistency: ConsistencyService) {}
  readonly name = 'get_consistency';
  readonly title = 'Constância';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly description =
    'Constância do período (30 dias, 90 dias ou 1 ano, terminando hoje): para cada dia, as ' +
    'áreas cumpridas (refeição registrada, treino concluído, água na meta, passos na meta) e a ' +
    'contagem de 0 a 4; os dias ativos (ao menos uma área); a sequência atual, com a tolerância ' +
    'de faltas; o recorde do período; e, por área, os dias na meta. Nada aqui cobra o dia vazio.';
  readonly inputSchema = {
    range: z
      .enum(CONSISTENCY_RANGES)
      .optional()
      .describe('Período: month (30 dias, padrão), quarter (90 dias) ou year (365 dias)'),
  } as const;
  execute(input: { range?: ConsistencyRange }, { userId, timezone }: McpToolContext) {
    return this.consistency.report({ userId, timezone }, input.range ?? 'month');
  }
}
