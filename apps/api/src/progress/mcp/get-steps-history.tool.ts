import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { StepLogService } from '../step-log.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetStepsHistoryTool implements McpToolDef {
  constructor(private readonly steps: StepLogService) {}
  readonly name = 'get_steps_history';
  readonly title = 'Histórico de passos';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'bars' as const;
  readonly description = 'Série temporal de passos por dia (preenche dias vazios com 0).';
  readonly inputSchema = {
    days: z
      .union([z.literal(7), z.literal(14), z.literal(30), z.literal(90), z.literal(180)])
      .describe('Janela do histórico em dias — um de 7, 14, 30, 90 ou 180'),
  } as const;
  execute(input: { days: number }, { userId, timezone }: McpToolContext) {
    return this.steps.getHistoryWithGoal(input.days, userId, timezone);
  }

  /** Barras por dia (prancha IA-Cartoes, #384), com a meta batida marcada. */
  artifact(result: unknown, input: { days: number }) {
    const historico = result as {
      days: { date: string; steps: number; goalReached: boolean | null }[];
      averageDaily: number;
    };
    return {
      kind: 'bars',
      label: `Passos nos últimos ${input.days} dias`,
      unit: 'passos',
      average: Math.round(historico.averageDaily),
      bars: historico.days.map((dia) => ({
        label: dia.date,
        value: dia.steps,
        ...(dia.goalReached === null ? {} : { reached: dia.goalReached }),
      })),
    };
  }
}
