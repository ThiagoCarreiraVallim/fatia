import { Injectable } from '@nestjs/common';
import { DashboardService } from '../dashboard.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetTodaySummaryTool implements McpToolDef {
  constructor(private readonly dashboard: DashboardService) {}
  readonly name = 'get_today_summary';
  readonly title = 'Resumo de hoje';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly description =
    'Resumo agregado de hoje: nutrição, treino, peso, passos e streaks. Reduz N chamadas a 1.';
  readonly inputSchema = {} as const;
  execute(_input: Record<string, never>, { userId, timezone }: McpToolContext) {
    return this.dashboard.today({ userId, timezone });
  }
  artifact(result: unknown) {
    const hoje = result as Awaited<ReturnType<DashboardService['today']>>;
    const { consumed, goals } = hoje.nutrition;
    return {
      kind: 'metric',
      label: 'Calorias de hoje',
      value: Math.round(consumed.kcal),
      unit: 'kcal',
      ...(goals ? { target: { min: goals.kcalMin, max: goals.kcalMax } } : {}),
      breakdown: [
        { label: 'Proteína', value: Math.round(consumed.proteinG), unit: 'g' },
        { label: 'Carboidrato', value: Math.round(consumed.carbsG), unit: 'g' },
        { label: 'Gordura', value: Math.round(consumed.fatG), unit: 'g' },
      ],
    };
  }
}
