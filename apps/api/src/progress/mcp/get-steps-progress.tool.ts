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
  readonly description = 'Pontos diários de passos + médias semanais + dias batidos.';
  readonly inputSchema = {
    days: z.union([z.literal(14), z.literal(30), z.literal(90), z.literal(180)]),
  } as const;
  execute(input: { days: number }, { userId, timezone }: McpToolContext) {
    return this.progress.stepsProgress(input.days, { userId, timezone });
  }
}
