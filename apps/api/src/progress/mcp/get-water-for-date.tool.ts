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
export class GetWaterForDateTool implements McpToolDef {
  constructor(private readonly waters: WaterLogService) {}
  readonly name = 'get_water_for_date';
  readonly title = 'Água de um dia';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly description = 'Retorna o total de água consumida em um dia (soma de todos os logs).';
  readonly inputSchema = {
    date: z.string().optional().describe('YYYY-MM-DD; default hoje'),
  } as const;
  execute(input: { date?: string }, { userId, timezone }: McpToolContext) {
    return this.waters.getForDateWithGoal(input.date, userId, timezone);
  }
}
