import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { WeightLogService } from '../weight-log.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class ListWeightLogsTool implements McpToolDef {
  constructor(private readonly weights: WeightLogService) {}
  readonly name = 'list_weight_logs';
  readonly title = 'Listar registros de peso';
  readonly annotations = { readOnlyHint: true, destructiveHint: false };
  readonly description = 'Lista logs de peso, com filtro de período e cursor de paginação.';
  readonly inputSchema = {
    from: z.string().optional().describe('Data inicial do intervalo, em YYYY-MM-DD'),
    to: z.string().optional().describe('Data final do intervalo, em YYYY-MM-DD'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Quantos registros retornar (default 20, máx 100)'),
    cursor: z
      .string()
      .optional()
      .describe('ID do último registro da página anterior, para paginar'),
  } as const;
  execute(
    input: { from?: string; to?: string; limit?: number; cursor?: string },
    { userId }: McpToolContext,
  ) {
    return this.weights.list(input, userId);
  }
}
