import { Injectable } from '@nestjs/common';
import { McpTool, type McpToolContext } from '../../../common/decorators/tool.decorator';
import { NutritionSummaryService } from '../../../nutrition/nutrition-summary.service';
import { UserGoalsService } from '../../../nutrition/user-goals.service';
import { StepLogService } from '../../../progress/step-log.service';
import { StreakService } from '../../../progress/streak.service';
import { WaterLogService } from '../../../progress/water-log.service';
import { WorkoutSessionService } from '../../../workout/workout-session.service';
import { IntentTool, resolverDia } from '../composicao';
import type { IntentInput } from '../intent-surface';

/**
 * O dia inteiro: cada parte é a saída da perna que a produz, sem conta nova. "Quanto falta"
 * é `goals` menos `nutrition.totals`, e as duas partes estão aqui.
 */
@Injectable()
@McpTool()
export class GetDayOverviewTool extends IntentTool<'get_day_overview'> {
  constructor(
    private readonly summary: NutritionSummaryService,
    private readonly goals: UserGoalsService,
    private readonly waters: WaterLogService,
    private readonly steps: StepLogService,
    private readonly streaks: StreakService,
    private readonly sessions: WorkoutSessionService,
  ) {
    super('get_day_overview');
  }

  async execute(input: IntentInput<'get_day_overview'>, { userId, timezone }: McpToolContext) {
    const date = resolverDia(input.day, timezone);
    const [nutrition, goals, water, steps, streak, workouts] = await Promise.all([
      this.summary.getDay(userId, date, timezone), // get_nutrition_summary
      this.goals.get(userId), // get_nutrition_goals
      this.waters.getForDateWithGoal(date, userId, timezone), // get_water_for_date
      this.steps.getStepsForDateWithGoal(date, userId, timezone), // get_steps_for_date
      this.streaks.compute({ userId, timezone }), // get_streak
      this.sessions.list(userId, { date }), // list_workout_sessions
    ]);
    return { date, nutrition, goals, water, steps, streak, workouts };
  }
}
