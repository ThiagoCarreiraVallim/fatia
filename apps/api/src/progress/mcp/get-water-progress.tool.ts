import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ProgressService } from '../progress.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetWaterProgressTool implements McpToolDef {
  constructor(private readonly progress: ProgressService) {}
  readonly name = 'get_water_progress';
  readonly description =
    'Estatísticas de hidratação: série diária, média, melhor dia, dias batendo a meta.';
  readonly inputSchema = {
    days: z.number().int().positive().max(365).optional().describe('Default: 30'),
  } as const;
  async execute({ days }: { days?: number }, { userId, timezone }: McpToolContext) {
    return this.progress.waterProgress(days ?? 30, { userId, timezone });
  }
}
