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
export class UpdateWaterLogTool implements McpToolDef {
  constructor(private readonly waters: WaterLogService) {}
  readonly name = 'update_water_log';
  readonly title = 'Atualizar registro de água';
  readonly annotations = { readOnlyHint: false, destructiveHint: false };
  readonly description = 'Atualiza um log de água existente (correção).';
  readonly inputSchema = {
    id: z.string().describe('ID do registro de hidratação a atualizar'),
    ml: z.number().int().positive().optional().describe('Novo volume em mL'),
    date: z.string().optional().describe('Nova data do registro, em YYYY-MM-DD'),
    notes: z.string().max(500).optional().describe('Novas observações do registro'),
  } as const;
  async execute(
    input: { id: string; ml?: number; date?: string; notes?: string },
    { userId }: McpToolContext,
  ) {
    const { id, ...patch } = input;
    return this.waters.update(id, patch, userId);
  }
}
