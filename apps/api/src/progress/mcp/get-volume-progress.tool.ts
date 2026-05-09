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
export class GetVolumeProgressTool implements McpToolDef {
  constructor(private readonly progress: ProgressService) {}
  readonly name = 'get_volume_progress';
  readonly description =
    'Volume total de força por semana, opcionalmente filtrado por grupo muscular.';
  readonly inputSchema = {
    days: z.union([z.literal(30), z.literal(90), z.literal(180)]),
    muscleGroup: z.string().optional(),
  } as const;
  execute(input: { days: number; muscleGroup?: string }, { userId, timezone }: McpToolContext) {
    return this.progress.volumeProgress(input.days, input.muscleGroup, { userId, timezone });
  }
}
