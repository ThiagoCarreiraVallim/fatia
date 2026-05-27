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
export class GetWaterHistoryTool implements McpToolDef {
  constructor(private readonly waters: WaterLogService) {}
  readonly name = 'get_water_history';
  readonly description = 'Histórico diário de consumo de água, preenchendo dias sem log com 0.';
  readonly inputSchema = {
    days: z.number().int().positive().max(365).describe('Quantidade de dias retroativos'),
  } as const;
  async execute({ days }: { days: number }, { userId, timezone }: McpToolContext) {
    return this.waters.getHistory(days, userId, timezone);
  }
}
