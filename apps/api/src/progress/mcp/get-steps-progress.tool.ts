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
export class GetStepsProgressTool implements McpToolDef {
  constructor(private readonly progress: ProgressService) {}

  readonly name = 'get_steps_progress';
  readonly description =
    'Returns step progress including daily points, weekly averages, days hitting goal, and daily target.';
  readonly inputSchema = {
    days: z.number().int().positive().optional().default(30),
    timezone: z.string().optional(),
  } as const;

  execute(input: { days?: number; timezone?: string }, { userId }: McpToolContext) {
    return this.progress.stepsProgress(userId, input.days ?? 30, input.timezone ?? 'UTC');
  }
}
