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
export class GetWaterProgressTool implements McpToolDef {
  constructor(private readonly progress: ProgressService) {}
  readonly name = 'get_water_progress';
  readonly title = 'Evolução da hidratação';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'bars' as const;
  readonly description =
    'Estatísticas de hidratação: série diária, média, melhor dia, dias batendo a meta.';
  readonly inputSchema = {
    days: z.number().int().positive().max(365).optional().describe('Default: 30'),
  } as const;
  async execute({ days }: { days?: number }, { userId, timezone }: McpToolContext) {
    return this.progress.waterProgress(days ?? 30, { userId, timezone });
  }

  /** A água de cada dia contra a meta (prancha IA-Cartoes, #384). */
  artifact(result: unknown, input: { days?: number }) {
    const progresso = result as Awaited<ReturnType<ProgressService['waterProgress']>>;
    return {
      kind: 'bars',
      label: `Água nos últimos ${input.days ?? 30} dias`,
      unit: 'ml',
      average: Math.round(progresso.averageDailyMl),
      ...(progresso.goalTargetMl == null ? {} : { goal: progresso.goalTargetMl }),
      bars: progresso.points.map((dia) => ({
        label: dayMonth(dia.date),
        value: dia.totalMl,
        ...(dia.goalReached == null ? {} : { reached: dia.goalReached }),
      })),
    };
  }
}
