import { Injectable } from '@nestjs/common';
import { McpTool, type McpToolContext } from '../../../common/decorators/tool.decorator';
import { NutritionSummaryService } from '../../../nutrition/nutrition-summary.service';
import { UserGoalsService } from '../../../nutrition/user-goals.service';
import { DashboardService } from '../../../progress/dashboard.service';
import { todayInTz } from '../../../progress/helpers/date-tz';
import { ProgressService } from '../../../progress/progress.service';
import { StepLogService } from '../../../progress/step-log.service';
import { IntentTool, janelaDa } from '../composicao';
import type { IntentInput } from '../intent-surface';

/** As janelas que cada perna aceita, como o schema dela declara. */
const JANELAS = {
  nutrition: [7, 14, 30, 60, 90], // get_nutrition_history: 1 a 90
  water: [7, 14, 30, 90, 180, 365], // get_water_progress: 1 a 365
  steps: [7, 14, 30, 90, 180], // get_steps_history
  weight: [14, 30, 90, 180, 365], // get_weight_progress
  volume: [30, 90, 180], // get_volume_progress
} as const;

const DIAS: Record<
  Exclude<IntentInput<'get_period_overview'>['period'], 'this_week' | 'this_month'>,
  number
> = {
  last_7_days: 7,
  last_30_days: 30,
  last_90_days: 90,
  last_180_days: 180,
  last_365_days: 365,
};

/**
 * "Esta semana" é o `get_week_summary`, que já é o resumo da semana corrente. As outras
 * janelas vão a cada perna de histórico com a janela que ela aceita mais perto do pedido, e a
 * resposta traz qual foi.
 */
@Injectable()
@McpTool()
export class GetPeriodOverviewTool extends IntentTool<'get_period_overview'> {
  constructor(
    private readonly goals: UserGoalsService,
    private readonly dashboard: DashboardService,
    private readonly summary: NutritionSummaryService,
    private readonly steps: StepLogService,
    private readonly progress: ProgressService,
  ) {
    super('get_period_overview');
  }

  async execute(input: IntentInput<'get_period_overview'>, { userId, timezone }: McpToolContext) {
    const ctx = { userId, timezone };
    const goals = await this.goals.get(userId); // get_nutrition_goals
    if (input.period === 'this_week') {
      return { period: input.period, goals, week: await this.dashboard.week(ctx) }; // get_week_summary
    }
    const dias =
      input.period === 'this_month' ? Number(todayInTz(timezone).slice(8, 10)) : DIAS[input.period];
    const janelas = {
      nutrition: janelaDa(dias, JANELAS.nutrition),
      water: janelaDa(dias, JANELAS.water),
      steps: janelaDa(dias, JANELAS.steps),
      weight: janelaDa(dias, JANELAS.weight),
      volume: janelaDa(dias, JANELAS.volume),
    };
    const [nutrition, water, steps, weight, volume] = await Promise.all([
      this.summary.getHistory(userId, janelas.nutrition, timezone), // get_nutrition_history
      this.progress.waterProgress(janelas.water, ctx), // get_water_progress
      this.steps.getHistoryWithGoal(janelas.steps, userId, timezone), // get_steps_history
      this.progress.weightProgress(janelas.weight, ctx), // get_weight_progress
      this.progress.volumeProgress(janelas.volume, undefined, ctx), // get_volume_progress
    ]);
    return {
      period: input.period,
      days: dias,
      janelas,
      goals,
      nutrition,
      water,
      steps,
      weight,
      volume,
    };
  }
}
