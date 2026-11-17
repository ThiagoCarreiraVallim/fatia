import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { WaterLogService } from '../water-log.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { dayMonth } from '../../mcp/card-format';

@Injectable()
@McpTool()
export class GetWaterForDateTool implements McpToolDef {
  constructor(private readonly waters: WaterLogService) {}
  readonly name = 'get_water_for_date';
  readonly title = 'Água de um dia';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'metric' as const;
  readonly description = 'Retorna o total de água consumida em um dia (soma de todos os logs).';
  readonly inputSchema = {
    date: z.string().optional().describe('YYYY-MM-DD; default hoje'),
  } as const;
  execute(input: { date?: string }, { userId, timezone }: McpToolContext) {
    return this.waters.getForDateWithGoal(input.date, userId, timezone);
  }

  /** A água do dia contra a meta (prancha IA-Cartoes, #384). */
  artifact(result: unknown) {
    const dia = result as Awaited<ReturnType<WaterLogService['getForDateWithGoal']>>;
    return {
      kind: 'metric',
      label: `Água em ${dayMonth(dia.date)}`,
      value: dia.totalMl,
      unit: 'ml',
      ...(dia.goalTargetMl == null ? {} : { target: { min: dia.goalTargetMl } }),
    };
  }
}
