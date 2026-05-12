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
    'Returns weekly training volume (kg*reps) over recent weeks, optionally filtered by muscle group.';
  readonly inputSchema = {
    days: z.number().int().positive().optional().default(30),
    muscleGroup: z.string().optional(),
    timezone: z.string().optional(),
  } as const;

  execute(
    input: { days?: number; muscleGroup?: string; timezone?: string },
    { userId }: McpToolContext,
  ) {
    return this.progress.volumeProgress(
      userId,
      input.days ?? 30,
      input.timezone ?? 'UTC',
      input.muscleGroup,
    );
  }
}
