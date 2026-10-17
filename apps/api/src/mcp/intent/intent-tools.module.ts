import { Module } from '@nestjs/common';
import { GoalsModule } from '../../goals/goals.module';
import { NutritionModule } from '../../nutrition/nutrition.module';
import { ProgressModule } from '../../progress/progress.module';
import { SharingModule } from '../../sharing/sharing.module';
import { WorkoutModule } from '../../workout/workout.module';
import { EditWorkoutPlanTool } from './tools/edit-workout-plan.tool';
import { FindMealsTool } from './tools/find-meals.tool';
import { FinishWorkoutTool } from './tools/finish-workout.tool';
import { FixMealTool } from './tools/fix-meal.tool';
import { GetDayOverviewTool } from './tools/get-day-overview.tool';
import { GetExerciseInsightTool } from './tools/get-exercise-insight.tool';
import { GetGoalsOverviewTool } from './tools/get-goals-overview.tool';
import { GetPeriodOverviewTool } from './tools/get-period-overview.tool';
import { GetSharingOverviewTool } from './tools/get-sharing-overview.tool';
import { GetStudentOverviewTool } from './tools/get-student-overview.tool';
import { MarkGoalDoneTool } from './tools/mark-goal-done.tool';
import { RecordMealTool } from './tools/record-meal.tool';
import { RecordMeasurementTool } from './tools/record-measurement.tool';
import { RecordSetsTool } from './tools/record-sets.tool';
import { ShareMyDataTool } from './tools/share-my-data.tool';
import { StartWorkoutTool } from './tools/start-workout.tool';
import { StopSharingTool } from './tools/stop-sharing.tool';
import { UpdateMyTargetsTool } from './tools/update-my-targets.tool';

/**
 * As 18 tools da superfície de intenção (braço B do eval da fronteira). Elas só injetam
 * services que os módulos de domínio já exportam para as tools de entidade, e só são
 * servidas com `x-fatia-superficie: intencao` e `MCP_SUPERFICIE_INTENCAO` ligada — sem isso,
 * existem no container e não existem para nenhum cliente.
 */
@Module({
  imports: [NutritionModule, ProgressModule, WorkoutModule, GoalsModule, SharingModule],
  providers: [
    EditWorkoutPlanTool,
    FindMealsTool,
    FinishWorkoutTool,
    FixMealTool,
    GetDayOverviewTool,
    GetExerciseInsightTool,
    GetGoalsOverviewTool,
    GetPeriodOverviewTool,
    GetSharingOverviewTool,
    GetStudentOverviewTool,
    MarkGoalDoneTool,
    RecordMealTool,
    RecordMeasurementTool,
    RecordSetsTool,
    ShareMyDataTool,
    StartWorkoutTool,
    StopSharingTool,
    UpdateMyTargetsTool,
  ],
})
export class IntentToolsModule {}
