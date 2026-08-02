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
  readonly title = 'Evolução dos passos';
  readonly annotations = { readOnlyHint: true, destructiveHint: false };
  readonly hostedInference = false;
  readonly description = 'Pontos diários de passos + médias semanais + dias batidos.';
  readonly inputSchema = {
    days: z
      .union([z.literal(14), z.literal(30), z.literal(90), z.literal(180)])
      .describe('Janela de análise em dias — um de 14, 30, 90 ou 180'),
  } as const;
  execute(input: { days: number }, { userId, timezone }: McpToolContext) {
    return this.progress.stepsProgress(input.days, { userId, timezone });
  }
}
