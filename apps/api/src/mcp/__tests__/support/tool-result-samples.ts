import type { ListMemoriesTool } from '../../../chat/memory/mcp/list-memories.tool';
import type { GetGoalTool } from '../../../goals/mcp/get-goal.tool';
import type { ListGoalsTool } from '../../../goals/mcp/list-goals.tool';
import type { GetMeTool } from '../../tools/meta/get-me.tool';
import type { GetNotificationSettingsTool } from '../../../notifications/mcp/get-notification-settings.tool';
import type { ListInboxTool } from '../../../notifications/mcp/list-inbox.tool';
import type { ListRemindersTool } from '../../../notifications/reminders/mcp/list-reminders.tool';
import type { GetFoodTool } from '../../../nutrition/mcp/get-food.tool';
import type { GetMealTool } from '../../../nutrition/mcp/get-meal.tool';
import type { GetNutrientSummaryTool } from '../../../nutrition/mcp/get-nutrient-summary.tool';
import type { GetNutritionGoalsTool } from '../../../nutrition/mcp/get-nutrition-goals.tool';
import type { GetNutritionHistoryTool } from '../../../nutrition/mcp/get-nutrition-history.tool';
import type { GetNutritionPlanTool } from '../../../nutrition/mcp/get-nutrition-plan.tool';
import type { GetNutritionSummaryTool } from '../../../nutrition/mcp/get-nutrition-summary.tool';
import type { ListCustomFoodsTool } from '../../../nutrition/mcp/list-custom-foods.tool';
import type { ListFoodGroupsTool } from '../../../nutrition/mcp/list-food-groups.tool';
import type { ListMealTemplatesTool } from '../../../nutrition/mcp/list-meal-templates.tool';
import type { ListMealsTool } from '../../../nutrition/mcp/list-meals.tool';
import type { ListMyFoodsTool } from '../../../nutrition/mcp/list-my-foods.tool';
import type { ListNutrientTargetsTool } from '../../../nutrition/mcp/list-nutrient-targets.tool';
import type { SearchFoodTool } from '../../../nutrition/mcp/search-food.tool';
import type { SuggestNutritionGoalsTool } from '../../../nutrition/mcp/suggest-nutrition-goals.tool';
import type { GetCardioProgressTool } from '../../../progress/mcp/get-cardio-progress.tool';
import type { GetConsistencyTool } from '../../../progress/mcp/get-consistency.tool';
import type { GetStepsForDateTool } from '../../../progress/mcp/get-steps-for-date.tool';
import type { GetStepsHistoryTool } from '../../../progress/mcp/get-steps-history.tool';
import type { GetStepsProgressTool } from '../../../progress/mcp/get-steps-progress.tool';
import type { GetStreakTool } from '../../../progress/mcp/get-streak.tool';
import type { GetStrengthProgressTool } from '../../../progress/mcp/get-strength-progress.tool';
import type { GetTodaySummaryTool } from '../../../progress/mcp/get-today-summary.tool';
import type { GetVolumeProgressTool } from '../../../progress/mcp/get-volume-progress.tool';
import type { GetWaterForDateTool } from '../../../progress/mcp/get-water-for-date.tool';
import type { GetWaterHistoryTool } from '../../../progress/mcp/get-water-history.tool';
import type { GetWaterProgressTool } from '../../../progress/mcp/get-water-progress.tool';
import type { GetWeekSummaryTool } from '../../../progress/mcp/get-week-summary.tool';
import type { GetWeightProgressTool } from '../../../progress/mcp/get-weight-progress.tool';
import type { ListAchievementsTool } from '../../../progress/mcp/list-achievements.tool';
import type { ListStepLogsTool } from '../../../progress/mcp/list-step-logs.tool';
import type { ListWaterLogsTool } from '../../../progress/mcp/list-water-logs.tool';
import type { ListWeightLogsTool } from '../../../progress/mcp/list-weight-logs.tool';
import type { RefreshAchievementsTool } from '../../../progress/mcp/refresh-achievements.tool';
import type { GetChallengeLeaderboardTool } from '../../../sharing/mcp/get-challenge-leaderboard.tool';
import type { GetGroupInviteTool } from '../../../sharing/mcp/get-group-invite.tool';
import type { GetStudentProgressTool } from '../../../sharing/mcp/get-student-progress.tool';
import type { ListDataAccessLogTool } from '../../../sharing/mcp/list-data-access-log.tool';
import type { ListDataSharingTool } from '../../../sharing/mcp/list-data-sharing.tool';
import type { ListGroupChallengesTool } from '../../../sharing/mcp/list-group-challenges.tool';
import type { ListGroupPlansTool } from '../../../sharing/mcp/list-group-plans.tool';
import type { ListGroupPostsTool } from '../../../sharing/mcp/list-group-posts.tool';
import type { ListGroupTipsTool } from '../../../sharing/mcp/list-group-tips.tool';
import type { ListMyGroupsTool } from '../../../sharing/mcp/list-my-groups.tool';
import type { ListMyStudentsTool } from '../../../sharing/mcp/list-my-students.tool';
import type { ListPlanOffersTool } from '../../../sharing/mcp/list-plan-offers.tool';
import type { ExportMyDataTool } from '../../../users/mcp/export-my-data.tool';
import type { ExplainFormTool } from '../../../workout/mcp/explain-form.tool';
import type { GetActiveWorkoutSessionTool } from '../../../workout/mcp/get-active-workout-session.tool';
import type { GetExerciseDetailsTool } from '../../../workout/mcp/get-exercise-details.tool';
import type { GetLastSetForExerciseTool } from '../../../workout/mcp/get-last-set-for-exercise.tool';
import type { GetLoadPrescriptionTool } from '../../../workout/mcp/get-load-prescription.tool';
import type { GetPersonalRecordTool } from '../../../workout/mcp/get-personal-record.tool';
import type { GetTrainingBlockTool } from '../../../workout/mcp/get-training-block.tool';
import type { GetWeeklyMuscleSummaryTool } from '../../../workout/mcp/get-weekly-muscle-summary.tool';
import type { GetWorkoutPlanTool } from '../../../workout/mcp/get-workout-plan.tool';
import type { GetWorkoutSessionTool } from '../../../workout/mcp/get-workout-session.tool';
import type { ListExercisesByMuscleTool } from '../../../workout/mcp/list-exercises-by-muscle.tool';
import type { ListPersonalRecordsTool } from '../../../workout/mcp/list-personal-records.tool';
import type { ListPlannedSessionsTool } from '../../../workout/mcp/list-planned-sessions.tool';
import type { ListWorkoutPlansTool } from '../../../workout/mcp/list-workout-plans.tool';
import type { ListWorkoutSessionsTool } from '../../../workout/mcp/list-workout-sessions.tool';
import type { SearchExerciseTool } from '../../../workout/mcp/search-exercise.tool';

/**
 * Um resultado de verdade de cada tool de leitura do chat, para o `chat-card-coverage.spec.ts`
 * conferir que o formato declarado (`card`) vira cartão (#384).
 *
 * Cada amostra é tipada pelo retorno do `execute` da própria tool: um campo que a tool não
 * devolve, ou de outro tipo, não compila. É parcial de propósito — uma linha do Prisma tem
 * dezenas de colunas —, mas traz ids, datas e objetos aninhados como a tool devolve, porque é
 * neles que um cartão genérico tropeça.
 */

type DeepPartial<T> = T extends Date
  ? T
  : T extends readonly (infer U)[]
    ? DeepPartial<U>[]
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = { execute(...args: any[]): unknown };
type ResultOf<T extends AnyTool> = Awaited<ReturnType<T['execute']>>;
type InputOf<T extends AnyTool> = Parameters<T['execute']>[0];

export interface ToolResultSample {
  result: unknown;
  input: unknown;
}

function sample<T extends AnyTool>(
  result: DeepPartial<ResultOf<T>>,
  input: Partial<InputOf<T>> = {},
): ToolResultSample {
  return { result, input };
}

const dia = (iso: string) => new Date(iso);

const exercicio = (id: number, name: string, muscleGroup: string) => ({
  id,
  name,
  searchName: name.toLowerCase(),
  muscleGroup,
  primaryMuscles: ['chest'],
  secondaryMuscles: ['triceps'],
  equipment: 'barbell',
  level: 'intermediate',
  mechanic: 'compound',
  instructions: ['Deite no banco.', 'Desça a barra até o peito.'],
  youtubeVideoId: 'abc123',
  youtubeVideoIdPt: null,
  createdByUserId: null,
  clonedFromId: null,
  groupOwned: false,
  groupId: null,
  createdAt: dia('2026-01-01T00:00:00Z'),
});

const alimento = (id: number, name: string, kcal: number, protein: number) => ({
  id,
  name,
  searchName: name.toLowerCase(),
  createdByUserId: 'u1',
  groupId: 3,
  nutrients: { fiberG: 2 },
  source: 'CUSTOM' as const,
  kcalPer100g: kcal,
  proteinPer100g: protein,
  carbsPer100g: 20,
  fatPer100g: 5,
  barcode: null,
  createdAt: dia('2026-10-01T12:00:00Z'),
  portions: [{ id: 'p1', label: 'fatia', grams: 30, mine: true }],
});

const itemDeRefeicao = (foodName: string, grams: number, kcal: number) => ({
  id: `mi-${foodName}`,
  mealId: 'm1',
  foodId: 10,
  groupId: 1,
  foodName,
  grams,
  kcal,
  proteinG: 10,
  carbsG: 20,
  fatG: 5,
  nutrients: null,
  portionLabel: null,
  portionQuantity: null,
  source: 'MANUAL' as const,
});

const refeicao = {
  id: 'm1',
  userId: 'u1',
  mealType: 'LUNCH' as const,
  eatenAt: dia('2026-11-16T15:30:00Z'),
  notes: null,
  createdAt: dia('2026-11-16T15:31:00Z'),
  hasPhoto: false,
  origin: 'MANUAL' as const,
  items: [itemDeRefeicao('Arroz branco', 150, 192), itemDeRefeicao('Frango grelhado', 120, 198)],
};

const serie = (setNumber: number, weightKg: number, reps: number) => ({
  id: `s${setNumber}`,
  sessionId: 'ws1',
  exerciseId: 7,
  setNumber,
  weightKg,
  reps,
  rpe: 8,
  durationSeconds: null,
  distanceMeters: null,
  avgHeartRate: null,
  kcalBurned: null,
  notes: null,
  clientKey: null,
  exercise: exercicio(7, 'Supino reto', 'peito'),
});

const sessao = {
  id: 'ws1',
  userId: 'u1',
  planId: 'wp1',
  fromPlan: true,
  planName: 'Treino A',
  startedAt: dia('2026-11-16T10:00:00Z'),
  completedAt: dia('2026-11-16T11:00:00Z'),
  notes: null,
  exerciseOrder: [7],
  removedExerciseIds: [],
  feeling: 3,
  circuit: null,
  checkin: null,
  plannedExercises: [
    {
      planExerciseId: 'pe1',
      exerciseId: 7,
      exerciseName: 'Supino reto',
      muscleGroup: 'peito',
      order: 1,
      targetSets: 3,
      targetReps: '8-12',
      repUnit: 'REPS' as const,
      loadMode: 'WEIGHT' as const,
      startLoadKg: 40,
      restSeconds: 90,
      technique: 'NORMAL' as const,
      biSetWithNext: false,
      notes: null,
      cardioTarget: null,
      cardioDurationSeconds: null,
      cardioDistanceMeters: null,
    },
  ],
  sets: [serie(1, 40, 10), serie(2, 42.5, 8)],
};

const exercicioDoPlano = {
  id: 'pe1',
  planId: 'wp1',
  exerciseId: 7,
  order: 1,
  targetSets: 3,
  targetReps: '8-12',
  repUnit: 'REPS' as const,
  loadMode: 'WEIGHT' as const,
  startLoadKg: 40,
  restSeconds: 90,
  technique: 'NORMAL' as const,
  biSetWithNext: false,
  notes: null,
  cardioTarget: null,
  cardioDurationSeconds: null,
  cardioDistanceMeters: null,
  cardioIntensity: null,
  sets: [],
  exercise: exercicio(7, 'Supino reto', 'peito'),
};

const plano = {
  id: 'wp1',
  userId: 'u1',
  name: 'Treino A',
  kind: 'STRENGTH' as const,
  fromTemplateId: null,
  fromOfferId: null,
  fromSessionId: null,
  createdAt: dia('2026-10-01T12:00:00Z'),
  circuit: null,
  exercises: [exercicioDoPlano],
  timesDone: 4,
  lastDoneAt: dia('2026-11-14T10:00:00Z'),
};

const meta = {
  id: 'g1',
  userId: 'u1',
  kind: 'weight' as const,
  title: 'Chegar a 70 kg',
  description: null,
  startValue: 78,
  targetValue: 70,
  unit: 'kg',
  lastReportedValue: null,
  deadline: dia('2027-03-01T03:00:00Z'),
  status: 'active' as const,
  createdAt: dia('2026-09-01T12:00:00Z'),
  completedAt: null,
  currentValue: 74,
  progressPercent: 50,
};

const metasNutricionais = {
  kcalMin: 1800,
  kcalMax: 2200,
  proteinMinG: 120,
  proteinMaxG: 160,
  carbsMinG: 180,
  carbsMaxG: 260,
  fatMinG: 50,
  fatMaxG: 80,
  weeklyWorkouts: 4,
  dailyStepsTarget: 8000,
  dailyWaterTargetMl: 2500,
};

const conquistas = [
  {
    key: 'first_meal',
    title: 'Primeira refeição',
    description: 'Registrou a primeira refeição.',
    condition: 'Registre uma refeição',
    unlockedAt: '2026-11-01T12:00:00.000Z',
    context: null,
    progress: null,
  },
  {
    key: 'streak_7',
    title: 'Sete dias seguidos',
    description: 'Uma semana inteira ativa.',
    condition: 'Fique 7 dias ativo',
    unlockedAt: null,
    context: null,
    progress: { current: 3, target: 7 },
  },
];

const desafio = {
  id: 'ch1',
  title: 'Mais passos de novembro',
  description: null,
  metric: 'STEPS' as const,
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  status: 'running' as const,
  endedEarly: false,
  participants: 12,
  canManage: false,
  me: { displayName: 'Thi', score: 81234, rank: 2, medal: 'silver' as const },
};

const pontosDePassos = [
  { date: '2026-11-15', steps: 4000, goalReached: false },
  { date: '2026-11-16', steps: 9000, goalReached: true },
];

const pontosDeAgua = [
  { date: '2026-11-15', totalMl: 1500, goalReached: false },
  { date: '2026-11-16', totalMl: 2600, goalReached: true },
];

export const TOOL_RESULT_SAMPLES: Record<string, ToolResultSample> = {
  // ------------------------------------------------------------------ metric
  get_food: sample<GetFoodTool>(alimento(10, 'Pão integral', 247, 13), { id: 10 }),
  get_last_set_for_exercise: sample<GetLastSetForExerciseTool>(
    { ...serie(3, 42.5, 8), session: { startedAt: dia('2026-11-14T10:00:00Z') } },
    { exerciseId: 7 },
  ),
  get_nutrition_summary: sample<GetNutritionSummaryTool>(
    {
      date: '2026-11-16',
      totals: { kcal: 1832.6, proteinG: 120.4, carbsG: 180.2, fatG: 60.9 },
      mealsCount: 1,
      meals: [refeicao],
    },
    { date: '2026-11-16' },
  ),
  get_personal_record: sample<GetPersonalRecordTool>(
    { weightKg: 60, reps: 6, sessionDate: dia('2026-11-10T10:00:00Z') },
    { exerciseId: 7 },
  ),
  get_steps_for_date: sample<GetStepsForDateTool>({
    date: '2026-11-16',
    steps: 9000,
    logCount: 2,
    sources: ['MANUAL'],
    goalReached: true,
    goalTarget: 8000,
  }),
  get_streak: sample<GetStreakTool>({
    activeDays: {
      periodos: 5,
      faltasUsadas: 0,
      faltasPermitidas: 1,
      periodoCorrenteEmAberto: false,
      janelaEsgotada: false,
    },
  }),
  get_today_summary: sample<GetTodaySummaryTool>({
    date: '2026-11-16',
    nutrition: {
      consumed: { kcal: 1500, proteinG: 100, carbsG: 150, fatG: 50 },
      goals: { userId: 'u1', updatedAt: dia('2026-10-01T12:00:00Z'), ...metasNutricionais },
      mealsLogged: 3,
      onTrack: true,
    },
  }),
  get_water_for_date: sample<GetWaterForDateTool>({
    date: '2026-11-16',
    totalMl: 1750,
    logCount: 5,
    goalReached: false,
    goalTargetMl: 2500,
  }),

  // ------------------------------------------------------------------ bars
  get_consistency: sample<GetConsistencyTool>({
    range: 'month',
    from: '2026-10-18',
    to: '2026-11-16',
    days: [
      { date: '2026-11-15', meal: true, workout: false, water: true, steps: false, count: 2 },
      { date: '2026-11-16', meal: true, workout: true, water: false, steps: true, count: 3 },
    ],
    activeDays: 16,
    totalDays: 30,
    record: 9,
    byArea: {
      meal: { days: 20, of: 30 },
      workout: { days: 10, of: 17 },
      water: { days: 12, of: 30 },
      steps: { days: 8, of: 30 },
    },
  }),
  get_nutrition_history: sample<GetNutritionHistoryTool>(
    {
      days: 7,
      series: [
        { date: '2026-11-15', kcal: 1900.4, proteinG: 110, carbsG: 200, fatG: 60, meals: 3 },
        { date: '2026-11-16', kcal: 2100.7, proteinG: 130, carbsG: 210, fatG: 70, meals: 4 },
      ],
      averages: { kcal: 2000, proteinG: 120, carbsG: 205, fatG: 65 },
    },
    { days: 7 },
  ),
  get_steps_history: sample<GetStepsHistoryTool>(
    { days: pontosDePassos, averageDaily: 6500, daysWithGoalReached: 1, totalDaysLogged: 2 },
    { days: 7 },
  ),
  get_steps_progress: sample<GetStepsProgressTool>(
    {
      points: pontosDePassos,
      weeklyAverages: [{ weekStart: '2026-11-09', avgSteps: 6500 }],
      totalSteps: 13000,
      averageDaily: 6500,
      bestDay: { date: '2026-11-16', steps: 9000 },
      goalTarget: 8000,
      daysWithGoalReached: 1,
    },
    { days: 30 },
  ),
  get_training_block: sample<GetTrainingBlockTool>({
    id: 'tb1',
    planId: 'wp1',
    planName: 'Treino A',
    kind: 'hypertrophy',
    kindLabel: 'Hipertrofia',
    repRange: '8-12',
    startDate: '2026-11-02',
    weeksTotal: 4,
    status: 'active',
    weeks: [
      {
        weekNumber: 1,
        label: 'Semana 1',
        weekStart: '2026-11-02',
        effectiveWeekStart: '2026-11-02',
        effectiveWeekEnd: '2026-11-08',
        sessionsDone: 4,
        sessionsTarget: 4,
        shiftedWeeks: 0,
        state: 'done',
        focus: 'accumulation',
        intensityFactor: 1,
        volumeFactor: 1,
      },
      {
        weekNumber: 2,
        label: 'Semana 2',
        weekStart: '2026-11-09',
        effectiveWeekStart: '2026-11-09',
        effectiveWeekEnd: '2026-11-15',
        sessionsDone: 2,
        sessionsTarget: 4,
        shiftedWeeks: 0,
        state: 'current',
        focus: 'accumulation',
        intensityFactor: 1.05,
        volumeFactor: 1,
      },
    ],
    deload: { suggested: false, reason: 'insufficient_history' },
    explanation: 'Semana 2 de 4.',
  }),
  get_volume_progress: sample<GetVolumeProgressTool>(
    {
      weeks: [
        { weekStart: '2026-11-02', totalVolumeKg: 8200.5, sessionCount: 4 },
        { weekStart: '2026-11-09', totalVolumeKg: 9100, sessionCount: 4 },
      ],
      averageWeeklyVolumeKg: 8650,
    },
    { days: 30 },
  ),
  get_water_history: sample<GetWaterHistoryTool>(
    [
      { date: '2026-11-15', totalMl: 1500 },
      { date: '2026-11-16', totalMl: 2600 },
    ],
    { days: 7 },
  ),
  get_water_progress: sample<GetWaterProgressTool>(
    {
      points: pontosDeAgua,
      totalMl: 4100,
      averageDailyMl: 2050,
      bestDay: { date: '2026-11-16', totalMl: 2600 },
      goalTargetMl: 2500,
      daysWithGoalReached: 1,
    },
    { days: 30 },
  ),
  get_week_summary: sample<GetWeekSummaryTool>({
    weekStart: '2026-11-16',
    weekEnd: '2026-11-22',
    nutrition: { avgKcal: 1980, avgProteinG: 120, daysOnTrack: 3 },
    workouts: {
      completed: 2,
      target: 4,
      sessions: [
        { date: '2026-11-16', planName: 'Treino A', volumeKg: 4200 },
        { date: '2026-11-17', planName: null, volumeKg: 3100 },
      ],
    },
    cardio: { sessionCount: 1, totalDurationSeconds: 1800, totalDistanceMeters: 5000 },
    steps: { totalSteps: 30000, avgDaily: 7500, daysWithGoalReached: 2, target: 8000 },
    weight: { startKg: 78, currentKg: 77.4, deltaKg: -0.6 },
  }),

  // ------------------------------------------------------------------ timeline
  get_cardio_progress: sample<GetCardioProgressTool>(
    {
      exercise: { id: 12, name: 'Corrida' },
      metric: 'duration',
      points: [
        {
          sessionDate: '2026-11-10',
          sessionId: 'ws2',
          durationSeconds: 1800,
          distanceMeters: 5000,
          paceSecondsPerKm: 360,
          kcalBurned: 320,
          value: 1800,
        },
        {
          sessionDate: '2026-11-14',
          sessionId: 'ws3',
          durationSeconds: 2100,
          distanceMeters: 6000,
          paceSecondsPerKm: 350,
          kcalBurned: 380,
          value: 2100,
        },
      ],
      bestSession: { sessionId: 'ws3', sessionDate: '2026-11-14', value: 2100 },
    },
    { exerciseId: 12, days: 30 },
  ),
  get_strength_progress: sample<GetStrengthProgressTool>(
    {
      exercise: { id: 7, name: 'Supino reto' },
      metric: 'max_weight',
      points: [
        {
          sessionDate: '2026-11-10',
          sessionId: 'ws2',
          value: 40,
          bestSet: { weightKg: 40, reps: 10 },
        },
        {
          sessionDate: '2026-11-14',
          sessionId: 'ws3',
          value: 42.5,
          bestSet: { weightKg: 42.5, reps: 8 },
        },
      ],
      startValue: 40,
      currentValue: 42.5,
      deltaPercent: 6.25,
    },
    { exerciseId: 7, days: 30 },
  ),
  get_student_progress: sample<GetStudentProgressTool>(
    {
      membershipId: 'gm1',
      timezone: 'America/Sao_Paulo',
      reading: {
        scope: 'BODY',
        weight: {
          points: [
            { date: '2026-11-01', weightKg: 78 },
            { date: '2026-11-15', weightKg: 77.2 },
          ],
          weeklyAverages: [{ weekStart: '2026-11-09', avgKg: 77.5, deltaKg: -0.5 }],
          totalDeltaKg: -0.8,
          currentWeightKg: 77.2,
        },
      },
    },
    { membershipId: 'gm1', scope: 'BODY', days: 30 },
  ),
  get_weight_progress: sample<GetWeightProgressTool>(
    {
      points: [
        { date: '2026-11-01', weightKg: 78 },
        { date: '2026-11-15', weightKg: 77.2 },
      ],
      weeklyAverages: [],
      totalDeltaKg: -0.8,
      currentWeightKg: 77.2,
      latest: { id: 'w2', weightKg: 77.2, date: '2026-11-15', loggedAt: '2026-11-15T10:00:00Z' },
      previous: { weightKg: 78, date: '2026-11-01' },
      deltaSinceLastKg: -0.8,
    },
    { days: 30 },
  ),

  // ------------------------------------------------------------------ range
  get_nutrient_summary: sample<GetNutrientSummaryTool>(
    {
      date: '2026-11-16',
      nutrients: [
        {
          nutrientKey: 'sodium_mg',
          label: 'Sódio',
          unit: 'mg',
          min: null,
          max: 2000,
          total: 1830.4,
          status: 'ok',
        },
        {
          nutrientKey: 'fiber_g',
          label: 'Fibras',
          unit: 'g',
          min: 25,
          max: null,
          total: 12,
          status: 'under',
        },
      ],
    },
    { date: '2026-11-16' },
  ),
  get_nutrition_goals: sample<GetNutritionGoalsTool>({
    userId: 'u1',
    updatedAt: dia('2026-10-01T12:00:00Z'),
    ...metasNutricionais,
  }),
  list_nutrient_targets: sample<ListNutrientTargetsTool>([
    {
      id: 'nt1',
      userId: 'u1',
      nutrientKey: 'sodium_mg',
      label: 'Sódio',
      unit: 'mg',
      min: null,
      max: 2000,
      period: 'daily',
      createdAt: dia('2026-10-01T12:00:00Z'),
      updatedAt: dia('2026-10-01T12:00:00Z'),
    },
  ]),

  // ------------------------------------------------------------------ progress
  get_goal: sample<GetGoalTool>(meta, { goalId: 'g1' }),
  list_goals: sample<ListGoalsTool>([meta]),

  // ------------------------------------------------------------------ comparison
  get_load_prescription: sample<GetLoadPrescriptionTool>(
    {
      status: 'ok',
      weightKg: 45,
      reps: 8,
      restSeconds: 120,
      basis: 'rpe',
      action: 'increase_load',
      capped: false,
    },
    { exerciseId: 7, targetReps: '8-12' },
  ),
  suggest_nutrition_goals: sample<SuggestNutritionGoalsTool>({
    age: 30,
    bmr: 1720,
    tdee: 2666,
    targetKcal: 2166,
    goals: metasNutricionais,
  }),

  // ------------------------------------------------------------------ scoreboard
  get_challenge_leaderboard: sample<GetChallengeLeaderboardTool>(
    {
      ...desafio,
      suggestedDisplayName: 'Thi',
      leaderboard: [
        { displayName: 'Ana', score: 90210, rank: 1, isMe: false, medal: 'gold' },
        { displayName: 'Thi', score: 81234, rank: 2, isMe: true, medal: 'silver' },
      ],
    },
    { groupId: 'gr1', challengeId: 'ch1' },
  ),

  // ------------------------------------------------------------------ badges
  list_achievements: sample<ListAchievementsTool>(conquistas),
  refresh_achievements: sample<RefreshAchievementsTool>(conquistas),

  // ------------------------------------------------------------------ instructions / file
  explain_form: sample<ExplainFormTool>([exercicio(7, 'Supino reto', 'peito')], {
    exerciseName: 'supino',
  }),
  export_my_data: sample<ExportMyDataTool>({
    url: 'https://api.fatia.app/api/exports/abc',
    expiresAt: dia('2026-11-18T10:00:00Z'),
  }),

  // ------------------------------------------------------------------ list
  get_active_workout_session: sample<GetActiveWorkoutSessionTool>(sessao),
  get_exercise_details: sample<GetExerciseDetailsTool>(
    {
      ...exercicio(7, 'Supino reto', 'peito'),
      favorite: true,
      community: {
        groupName: 'Academia Centro',
        tips: 'Escápulas juntas.',
        hasVideo: true,
        photoCount: 2,
      },
    },
    { exerciseId: 7 },
  ),
  get_group_invite: sample<GetGroupInviteTool>(
    {
      group: {
        id: 'gr1',
        name: 'Academia Centro',
        description: 'A academia do bairro.',
        type: 'SPONSORED',
      },
      role: 'MEMBER',
      invitedBy: 'Helena',
      team: [{ name: 'Helena', role: 'PROFESSIONAL' }],
      memberCount: 42,
      emailBound: false,
      expiresAt: dia('2026-11-30T12:00:00Z'),
      requiredSharingScopes: ['WORKOUT'],
      activeChallenge: { title: 'Mais passos de novembro', participants: 12 },
    },
    { token: 'tok' },
  ),
  get_me: sample<GetMeTool>({
    id: 'u1',
    email: 'pessoa@example.com',
    name: 'Pessoa Teste',
    role: 'USER',
    timezone: 'America/Sao_Paulo',
    sex: 'FEMALE',
    birthDate: dia('1996-03-12T00:00:00Z'),
    heightCm: 168,
    activityLevel: 'MODERATE',
    objective: 'LOSE',
    onboardedAt: dia('2026-09-01T12:00:00Z'),
    onboardingStep: null,
    nickname: 'Pê',
    bio: null,
    avatarVisibility: 'COMMUNITIES',
    keepMealPhotos: true,
    whatsapp: null,
    whatsappOptIn: false,
    loadUnit: 'KG',
    distanceUnit: 'KM',
    avatarUrl: null,
  }),
  get_meal: sample<GetMealTool>(refeicao, { id: 'm1' }),
  get_notification_settings: sample<GetNotificationSettingsTool>({
    preferences: { COMMUNITY: true, CHALLENGES: false, BIRTHDAY: false },
    quietHours: { enabled: true, from: '22:00', to: '07:00' },
    team: { name: 'Helena' },
    community: { name: 'Academia Centro' },
  }),
  get_nutrition_plan: sample<GetNutritionPlanTool>({
    date: '2026-11-16',
    active: {
      id: 'np1',
      version: 2,
      status: 'ACCEPTED',
      author: { name: 'Helena' },
      sentAt: dia('2026-11-01T12:00:00Z'),
      acceptedAt: dia('2026-11-02T12:00:00Z'),
      goals: metasNutricionais,
      applyGoals: true,
      note: null,
      meals: [
        {
          id: 'pm1',
          mealType: 'BREAKFAST',
          name: 'Café da manhã',
          position: 1,
          logged: null,
          options: [
            {
              id: 'po1',
              position: 1,
              kcal: 420,
              proteinG: 25,
              carbsG: 50,
              fatG: 12,
              items: [
                {
                  id: 'pi1',
                  foodName: 'Pão integral',
                  grams: 60,
                  portionLabel: null,
                  portionQuantity: null,
                  kcal: 150,
                  proteinG: 7,
                  carbsG: 25,
                  fatG: 2,
                  equivalenceGroup: null,
                  equivalents: [],
                  swap: null,
                },
              ],
            },
          ],
        },
        {
          id: 'pm2',
          mealType: 'LUNCH',
          name: 'Almoço',
          position: 2,
          logged: { mealId: 'm1', optionId: 'po2' },
          options: [{ id: 'po2', position: 1, kcal: 650, proteinG: 45, carbsG: 70, fatG: 18 }],
        },
      ],
    },
    pending: null,
    teamSees: true,
    viewerName: 'Helena',
    week: { inRangeDays: 5, days: 7 },
  }),
  get_workout_plan: sample<GetWorkoutPlanTool>(plano, { planId: 'wp1' }),
  get_workout_session: sample<GetWorkoutSessionTool>(sessao, { sessionId: 'ws1' }),
  list_data_sharing: sample<ListDataSharingTool>([
    {
      linkId: 'l1',
      groupId: 'gr1',
      groupName: 'Academia Centro',
      professionalMembershipId: 'gm2',
      professionalName: 'Helena',
      scopes: ['WORKOUT', 'NUTRITION'],
      grantedAt: dia('2026-10-01T12:00:00Z'),
    },
  ]),
  list_group_challenges: sample<ListGroupChallengesTool>(
    { today: '2026-11-16', challenges: [desafio] },
    { groupId: 'gr1' },
  ),
  list_group_posts: sample<ListGroupPostsTool>(
    {
      posts: [
        {
          id: 'po1',
          body: 'Bora treinar amanhã cedo?',
          createdAt: dia('2026-11-16T09:00:00Z'),
          author: { displayName: 'Ana', team: false, isMe: false, avatarUrl: null },
          images: 0,
          pinned: false,
          removed: null,
          reactions: { counts: { STRONG: 3 }, mine: null },
          commentCount: 2,
          canDelete: false,
          canModerate: false,
        },
      ],
      policy: 'ALL_MEMBERS',
      canPost: true,
      canModerate: false,
      displayName: 'Thi',
      suggestedDisplayName: 'Thi',
      nextCursor: null,
    },
    { groupId: 'gr1' },
  ),
  list_group_tips: sample<ListGroupTipsTool>(
    [
      {
        id: 't1',
        title: 'Dica de proteína',
        body: 'Distribua a proteína ao longo do dia.',
        category: 'NUTRITION',
        image: null,
        pinned: true,
        authorName: 'Helena',
        publishedAt: dia('2026-11-01T12:00:00Z'),
        updatedAt: dia('2026-11-01T12:00:00Z'),
      },
    ],
    { groupId: 'gr1' },
  ),
  list_inbox: sample<ListInboxTool>({
    items: [
      {
        id: 'n1',
        kind: 'PLAN_RECEIVED',
        title: 'Plano novo da Helena',
        body: 'Abra para ver o treino.',
        url: '/treino',
        readAt: null,
        createdAt: dia('2026-11-16T09:00:00Z'),
      },
    ],
    unread: 1,
  }),
  list_meal_templates: sample<ListMealTemplatesTool>([
    {
      id: 'mt1',
      userId: 'u1',
      name: 'Café de sempre',
      mealType: 'BREAKFAST',
      fromTemplateId: null,
      createdAt: dia('2026-10-01T12:00:00Z'),
      updatedAt: dia('2026-10-01T12:00:00Z'),
      items: [{ ...itemDeRefeicao('Pão integral', 60, 150), position: 1, templateId: 'mt1' }],
    },
  ]),
  list_memories: sample<ListMemoriesTool>([
    { id: 'me1', content: 'Não come carne vermelha.', createdAt: dia('2026-10-01T12:00:00Z') },
  ]),
  list_my_groups: sample<ListMyGroupsTool>([
    {
      id: 'gr1',
      type: 'SPONSORED',
      name: 'Academia Centro',
      slug: 'academia-centro',
      description: null,
      joinPolicy: 'INVITE_ONLY',
      role: 'MEMBER',
      status: 'ACTIVE',
      membershipId: 'gm1',
      joinedAt: dia('2026-10-01T12:00:00Z'),
      createdAt: dia('2026-09-01T12:00:00Z'),
      consentScopes: ['WORKOUT'],
      statsOptIn: true,
      hasAiSeat: false,
      avatarUrl: null,
    },
  ]),
  list_plan_offers: sample<ListPlanOffersTool>({
    pending: [
      {
        id: 'of1',
        author: { name: 'Helena' },
        group: { id: 'gr1', name: 'Academia Centro' },
        kind: 'new',
        shown: {
          id: 'ov1',
          version: 1,
          status: 'PENDING',
          title: 'Hipertrofia 4x',
          schedule: 'FLEXIBLE',
          startDate: null,
          endDate: null,
          weeks: null,
          weekdays: [],
          note: null,
          sentAt: dia('2026-11-15T12:00:00Z'),
          respondedAt: null,
          summary: { exercises: 6, sets: 18, minutes: 60 },
          exercises: [],
          removed: [],
        },
        accepted: null,
        diff: null,
        planId: null,
      },
    ],
    accepted: [
      {
        id: 'of0',
        versionId: 'ov0',
        title: 'Base de força',
        version: 1,
        kind: 'new',
        status: 'ACCEPTED',
        schedule: 'FLEXIBLE',
        authorName: 'Helena',
        groupName: 'Academia Centro',
        sentAt: dia('2026-10-01T12:00:00Z'),
        planId: 'wp1',
        href: '/treino/planos/wp1',
      },
    ],
  }),

  // ------------------------------------------------------------------ report
  get_weekly_muscle_summary: sample<GetWeeklyMuscleSummaryTool>({
    from: '2026-11-10',
    target: 10,
    sets: [
      { group: 'peito', sets: 12 },
      { group: 'costas', sets: 6 },
    ],
    rested: [
      { group: 'pernas', daysSince: null },
      { group: 'costas', daysSince: 4 },
    ],
    suggestedPlan: { id: 'wp2', name: 'Treino B', groups: ['pernas'] },
    week: {
      start: '2026-11-16',
      days: [{ date: '2026-11-16', trained: true, active: false, today: true }],
      done: 1,
      target: 4,
    },
  }),
  list_custom_foods: sample<ListCustomFoodsTool>([alimento(10, 'Pão integral', 247, 13)]),
  list_data_access_log: sample<ListDataAccessLogTool>([
    {
      at: dia('2026-11-16T12:00:00Z'),
      action: 'get_student_progress',
      scope: 'WORKOUT',
      denied: false,
      professionalName: 'Helena',
    },
  ]),
  list_exercises_by_muscle: sample<ListExercisesByMuscleTool>(
    [exercicio(7, 'Supino reto', 'peito'), exercicio(8, 'Crucifixo', 'peito')],
    { muscleGroup: 'peito' },
  ),
  list_food_groups: sample<ListFoodGroupsTool>([
    { id: 1, name: 'Cereais e derivados' },
    { id: 2, name: 'Frutas e derivados' },
  ]),
  list_group_plans: sample<ListGroupPlansTool>(
    [
      {
        id: 'tp1',
        kind: 'WORKOUT',
        title: 'Iniciante 3x',
        description: null,
        level: 'beginner',
        cover: null,
        authorName: 'Helena',
        publishedAt: dia('2026-10-01T12:00:00Z'),
        updatedAt: dia('2026-10-01T12:00:00Z'),
        exercises: [
          { name: 'Agachamento', muscleGroup: 'pernas', targetSets: 3, targetReps: '10' },
        ],
        goals: null,
        meals: [],
        adoptedPlanId: null,
      },
    ],
    { groupId: 'gr1' },
  ),
  list_meals: sample<ListMealsTool>([refeicao]),
  list_my_foods: sample<ListMyFoodsTool>({
    favorites: [],
    recent: [
      {
        ...alimento(10, 'Pão integral', 247, 13),
        lastGrams: 60,
        lastPortionLabel: null,
        lastPortionQuantity: null,
        timesEaten: 9,
        favorite: false,
      },
    ],
  }),
  list_my_students: sample<ListMyStudentsTool>([
    {
      membershipId: 'gm1',
      name: 'Pessoa Teste',
      groupId: 'gr1',
      groupName: 'Academia Centro',
      joinedAt: dia('2026-10-01T12:00:00Z'),
      scopesGrantedToMe: [],
    },
  ]),
  list_personal_records: sample<ListPersonalRecordsTool>({
    records: [
      {
        exerciseId: 7,
        exerciseName: 'Supino reto',
        muscleGroup: 'peito',
        type: 'strength',
        maxWeightKg: 60,
        repsAtMax: 6,
        estimated1RM: 72,
        maxDistanceMeters: null,
        bestDurationSeconds: null,
        achievedAt: '2026-11-10',
        lastPerformedAt: '2026-11-14',
        totalSets: 48,
        monthEvolution: null,
      },
    ],
    highlight: null,
  }),
  list_planned_sessions: sample<ListPlannedSessionsTool>({
    today: '2026-11-16',
    from: '2026-11-16',
    to: '2026-11-22',
    days: [
      {
        date: '2026-11-16',
        items: [
          {
            id: 'ps1',
            kind: 'planned',
            planId: 'wp1',
            planName: 'Treino A',
            order: 1,
            state: 'done',
            rescheduledFrom: null,
            canReschedule: false,
            endDate: '2026-12-20',
          },
        ],
      },
      {
        date: '2026-11-18',
        items: [
          {
            id: 'ps2',
            kind: 'planned',
            planId: 'wp1',
            planName: 'Treino B',
            order: 2,
            state: 'planned',
            rescheduledFrom: null,
            canReschedule: true,
            endDate: '2026-12-20',
          },
        ],
      },
      { date: '2026-11-19', items: [] },
    ],
    calendarPlan: null,
    flexible: [],
    ended: null,
  }),
  list_reminders: sample<ListRemindersTool>([
    {
      id: 'r1',
      kind: 'WATER',
      habitId: null,
      title: 'Água',
      mode: 'INTERVAL',
      everyHours: 2,
      from: '08:00',
      to: '20:00',
      times: [],
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      stepsBelow: null,
      enabled: true,
      createdAt: dia('2026-10-01T12:00:00Z'),
      updatedAt: dia('2026-10-01T12:00:00Z'),
    },
  ]),
  list_step_logs: sample<ListStepLogsTool>({
    logs: [
      {
        id: 'sl1',
        userId: 'u1',
        date: '2026-11-16',
        steps: 9000,
        source: 'MANUAL',
        notes: null,
        loggedAt: dia('2026-11-16T20:00:00Z'),
      },
    ],
    nextCursor: undefined,
  }),
  list_water_logs: sample<ListWaterLogsTool>({
    logs: [
      {
        id: 'wl1',
        userId: 'u1',
        date: '2026-11-16',
        ml: 500,
        notes: null,
        loggedAt: dia('2026-11-16T12:00:00Z'),
      },
    ],
    nextCursor: undefined,
  }),
  list_weight_logs: sample<ListWeightLogsTool>({
    logs: [
      {
        id: 'w1',
        userId: 'u1',
        weightKg: 77.2,
        notes: null,
        loggedAt: dia('2026-11-15T10:00:00Z'),
        createdAt: dia('2026-11-15T10:00:00Z'),
      },
    ],
    nextCursor: undefined,
  }),
  list_workout_plans: sample<ListWorkoutPlansTool>([plano]),
  list_workout_sessions: sample<ListWorkoutSessionsTool>([
    { ...sessao, kind: 'plan', plan: { ...plano, exercises: [exercicioDoPlano] } },
  ]),
  search_exercise: sample<SearchExerciseTool>(
    [{ ...exercicio(7, 'Supino reto', 'peito'), communityName: null, favorite: false }],
    { q: 'supino' },
  ),
  search_food: sample<SearchFoodTool>([alimento(10, 'Pão integral', 247, 13)], {
    q: 'pão',
  }),
};
