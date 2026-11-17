import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ProgressService } from '../progress.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { dayMonth } from '../../mcp/card-format';

@Injectable()
@McpTool()
export class GetStepsProgressTool implements McpToolDef {
  constructor(private readonly progress: ProgressService) {}
  readonly name = 'get_steps_progress';
  readonly title = 'Evolução dos passos';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'bars' as const;
  readonly description = 'Pontos diários de passos + médias semanais + dias batidos.';
  readonly inputSchema = {
    days: z
      .union([z.literal(14), z.literal(30), z.literal(90), z.literal(180)])
      .describe('Janela de análise em dias — um de 14, 30, 90 ou 180'),
  } as const;
  execute(input: { days: number }, { userId, timezone }: McpToolContext) {
    return this.progress.stepsProgress(input.days, { userId, timezone });
  }

  /** Os passos de cada dia contra a meta (prancha IA-Cartoes, #384). */
  artifact(result: unknown, input: { days: number }) {
    const progresso = result as Awaited<ReturnType<ProgressService['stepsProgress']>>;
    return {
      kind: 'bars',
      label: `Passos nos últimos ${input.days} dias`,
      unit: 'passos',
      average: Math.round(progresso.averageDaily),
      ...(progresso.goalTarget == null ? {} : { goal: progresso.goalTarget }),
      bars: progresso.points.map((dia) => ({
        label: dayMonth(dia.date),
        value: dia.steps,
        ...(dia.goalReached == null ? {} : { reached: dia.goalReached }),
      })),
    };
  }
}
