import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { WaterLogService } from '../water-log.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class ListWaterLogsTool implements McpToolDef {
  constructor(private readonly waters: WaterLogService) {}
  readonly name = 'list_water_logs';
  readonly title = 'Listar registros de água';
  readonly annotations = { readOnlyHint: true };
  readonly description = 'Lista logs de água paginados, com filtros opcionais por data.';
  readonly inputSchema = {
    from: z.string().optional().describe('YYYY-MM-DD inicial'),
    to: z.string().optional().describe('YYYY-MM-DD final'),
    limit: z
      .number()
      .int()
      .positive()
      .max(100)
      .optional()
      .describe('Quantos registros retornar (default 20, máx 100)'),
    cursor: z
      .string()
      .optional()
      .describe('ID do último registro da página anterior, para paginar'),
  } as const;
  async execute(
    input: { from?: string; to?: string; limit?: number; cursor?: string },
    { userId }: McpToolContext,
  ) {
    return this.waters.list(input, userId);
  }
}
