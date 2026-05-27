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
  readonly description = 'Atualiza um log de água existente (correção).';
  readonly inputSchema = {
    id: z.string(),
    ml: z.number().int().positive().optional(),
    date: z.string().optional(),
    notes: z.string().max(500).optional(),
  } as const;
  async execute(
    input: { id: string; ml?: number; date?: string; notes?: string },
    { userId }: McpToolContext,
  ) {
    const { id, ...patch } = input;
    return this.waters.update(id, patch, userId);
  }
}
