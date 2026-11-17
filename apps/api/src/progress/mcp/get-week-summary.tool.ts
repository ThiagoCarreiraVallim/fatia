import { Injectable } from '@nestjs/common';
import { DashboardService } from '../dashboard.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { dayMonth } from '../../mcp/card-format';

@Injectable()
@McpTool()
export class GetWeekSummaryTool implements McpToolDef {
  constructor(private readonly dashboard: DashboardService) {}
  readonly name = 'get_week_summary';
  readonly title = 'Resumo da semana';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'bars' as const;
  readonly description = 'Resumo da semana corrente: nutrição, treinos, cardio, passos, peso.';
  readonly inputSchema = {} as const;
  execute(_input: Record<string, never>, { userId, timezone }: McpToolContext) {
    return this.dashboard.week({ userId, timezone });
  }

  /**
   * A semana numa barra por área: treinos feitos e dias na meta de calorias e de passos
   * (prancha IA-Cartoes, #384). O verde é a área que bateu a meta da semana.
   */
  artifact(result: unknown) {
    const semana = result as Awaited<ReturnType<DashboardService['week']>>;
    const { workouts, nutrition, steps } = semana;
    return {
      kind: 'bars',
      label: `Semana de ${dayMonth(semana.weekStart)} a ${dayMonth(semana.weekEnd)}`,
      bars: [
        {
          label: 'Treinos',
          value: workouts.completed,
          ...(workouts.target == null ? {} : { reached: workouts.completed >= workouts.target }),
        },
        { label: 'Dias na meta de calorias', value: nutrition.daysOnTrack },
        { label: 'Dias na meta de passos', value: steps.daysWithGoalReached },
      ],
    };
  }
}
