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
  readonly description = 'Lista logs de água paginados, com filtros opcionais por data.';
  readonly inputSchema = {
    from: z.string().optional().describe('YYYY-MM-DD inicial'),
    to: z.string().optional().describe('YYYY-MM-DD final'),
    limit: z.number().int().positive().max(100).optional(),
    cursor: z.string().optional(),
  } as const;
  async execute(
    input: { from?: string; to?: string; limit?: number; cursor?: string },
    { userId }: McpToolContext,
  ) {
    return this.waters.list(input, userId);
  }
}
