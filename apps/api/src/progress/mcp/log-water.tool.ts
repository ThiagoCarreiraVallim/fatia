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
export class LogWaterTool implements McpToolDef {
  constructor(private readonly waters: WaterLogService) {}
  readonly name = 'log_water';
  readonly title = 'Registrar água';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    'Registra consumo de água em mL para o dia. Múltiplos logs por dia são somados (cada copo/garrafa é um log). ' +
    'Exemplo: {"ml":500,"date":"2026-07-29"}';
  readonly inputSchema = {
    ml: z.number().int().positive().describe('Volume em mL (ex.: 250 = copo, 500 = garrafa)'),
    date: z.string().optional().describe('YYYY-MM-DD; default hoje no fuso do user'),
    notes: z.string().max(500).optional().describe('Observações do registro'),
  } as const;
  execute(
    input: { ml: number; date?: string; notes?: string },
    { userId, timezone }: McpToolContext,
  ) {
    return this.waters.logWithDayTotal(input, userId, timezone);
  }
}
