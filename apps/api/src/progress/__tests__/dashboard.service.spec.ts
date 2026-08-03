import { DashboardService } from '../dashboard.service';
import type { PrismaService } from '../../common/prisma.service';
import type { StepLogService } from '../step-log.service';
import type { WeightLogService } from '../weight-log.service';
import type { WaterLogService } from '../water-log.service';
import type { StreakService, StreakSummary } from '../streak.service';
import type { AchievementService } from '../achievement.service';
import type { TrainingBlockService } from '../../workout/training-block.service';

jest.mock('../helpers/date-tz', () => ({
  todayInTz: jest.fn(() => '2026-01-15'),
  addDaysIso: jest.fn((ymd: string, days: number) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }),
  weekStartInTz: jest.fn((date: Date) => {
    const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dow = utc.getUTCDay();
    const offset = dow === 0 ? -6 : 1 - dow;
    utc.setUTCDate(utc.getUTCDate() + offset);
    return utc.toISOString().slice(0, 10);
  }),
  dayBoundsInTz: jest.fn((ymd: string) => {
    const start = new Date(`${ymd}T00:00:00.000Z`);
    return { start, end: new Date(start.getTime() + 86_400_000) };
  }),
}));

type MockPrisma = {
  meal: { findMany: jest.Mock; count: jest.Mock };
  userGoals: { findUnique: jest.Mock };
  workoutSession: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  weightLog: { findMany: jest.Mock };
};

/**
 * As sequências saíram daqui para o `StreakService` — e os testes delas saíram para
 * `streak.service.spec.ts`, que usa os helpers de fuso REAIS. Um teste de streak escrito neste
 * arquivo herdaria o `jest.mock('../helpers/date-tz')` do topo e não poderia pegar bug de fuso,
 * que é o defeito que streak mais tem.
 */
const STREAK_VAZIO = {
  periodos: 0,
  faltasUsadas: 0,
  faltasPermitidas: 0,
  periodoCorrenteEmAberto: false,
  janelaEsgotada: false,
};

const RESUMO_DE_STREAK: StreakSummary = {
  activeDays: STREAK_VAZIO,
  nutritionDays: STREAK_VAZIO,
  workoutWeeks: STREAK_VAZIO,
  stepsDays: STREAK_VAZIO,
  stepsTargetSet: false,
};

type MockStepLogs = {
  getStepsForDate: jest.Mock;
};

type MockWeightLogs = {
  getLatest: jest.Mock;
};

type MockWaterLogs = {
  getForDate: jest.Mock;
};

const makePrisma = (): MockPrisma => ({
  meal: { findMany: jest.fn(), count: jest.fn() },
  userGoals: { findUnique: jest.fn() },
  workoutSession: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  weightLog: { findMany: jest.fn() },
});

const makeStepLogs = (): MockStepLogs => ({ getStepsForDate: jest.fn() });
const makeWeightLogs = (): MockWeightLogs => ({ getLatest: jest.fn() });
const makeWaterLogs = (): MockWaterLogs => ({ getForDate: jest.fn() });

const makeItem = (overrides: Partial<Record<string, number>> = {}) => ({
  kcal: 500,
  proteinG: 30,
  carbsG: 60,
  fatG: 15,
  ...overrides,
});

const makeMeal = (
  items: ReturnType<typeof makeItem>[],
  eatenAt = new Date('2026-01-15T12:00:00Z'),
) => ({
  id: 'meal-1',
  userId: 'user-A',
  eatenAt,
  items,
});

const makeGoals = (overrides: Partial<Record<string, number | null>> = {}) => ({
  kcalMin: 1800,
  kcalMax: 2200,
  dailyStepsTarget: 8000,
  weeklyWorkouts: 4,
  ...overrides,
});

describe('DashboardService', () => {
  let prisma: MockPrisma;
  let stepLogs: MockStepLogs;
  let weightLogs: MockWeightLogs;
  let waterLogs: MockWaterLogs;
  let streaks: { compute: jest.Mock };
  let achievements: { evaluate: jest.Mock; list: jest.Mock };
  let trainingBlocks: { getActive: jest.Mock };
  let service: DashboardService;
  const ctx = { userId: 'user-A', timezone: 'UTC' };

  beforeEach(() => {
    prisma = makePrisma();
    stepLogs = makeStepLogs();
    weightLogs = makeWeightLogs();
    waterLogs = makeWaterLogs();
    // Default: zero água logada — testes que precisam override fazem manualmente.
    waterLogs.getForDate.mockResolvedValue({ date: '2026-01-15', totalMl: 0, logCount: 0 });
    streaks = { compute: jest.fn().mockResolvedValue(RESUMO_DE_STREAK) };
    achievements = {
      evaluate: jest.fn().mockResolvedValue([]),
      list: jest.fn().mockResolvedValue([]),
    };
    trainingBlocks = { getActive: jest.fn().mockResolvedValue(null) };
    service = new DashboardService(
      prisma as unknown as PrismaService,
      stepLogs as unknown as StepLogService,
      weightLogs as unknown as WeightLogService,
      waterLogs as unknown as WaterLogService,
      streaks as unknown as StreakService,
      achievements as unknown as AchievementService,
      trainingBlocks as unknown as TrainingBlockService,
    );
  });

  describe('today', () => {
    it('aggregates meal items into total consumed macros', async () => {
      prisma.meal.findMany.mockResolvedValue([
        makeMeal([makeItem({ kcal: 500, proteinG: 30, carbsG: 60, fatG: 15 })]),
        makeMeal([
          makeItem({ kcal: 300, proteinG: 20, carbsG: 40, fatG: 10 }),
          makeItem({ kcal: 200, proteinG: 10, carbsG: 25, fatG: 5 }),
        ]),
      ]);
      prisma.userGoals.findUnique.mockResolvedValue(null);
      prisma.workoutSession.findFirst.mockResolvedValue(null);
      weightLogs.getLatest.mockResolvedValue(null);
      stepLogs.getStepsForDate.mockResolvedValue({ steps: 0, logCount: 0, sources: [] });

      const result = await service.today(ctx);

      expect(result.nutrition.consumed).toEqual({
        kcal: 1000,
        proteinG: 60,
        carbsG: 125,
        fatG: 30,
      });
      expect(result.nutrition.mealsLogged).toBe(2);
    });

    it('flags onTrack=true when consumed kcal is within goal range', async () => {
      prisma.meal.findMany.mockResolvedValue([makeMeal([makeItem({ kcal: 2000 })])]);
      prisma.userGoals.findUnique.mockResolvedValue(makeGoals({ kcalMin: 1800, kcalMax: 2200 }));
      prisma.workoutSession.findFirst.mockResolvedValue(null);
      weightLogs.getLatest.mockResolvedValue(null);
      stepLogs.getStepsForDate.mockResolvedValue({ steps: 0, logCount: 0, sources: [] });

      const result = await service.today(ctx);

      expect(result.nutrition.onTrack).toBe(true);
    });

    it('flags onTrack=false when consumed kcal is outside goal range', async () => {
      prisma.meal.findMany.mockResolvedValue([makeMeal([makeItem({ kcal: 2500 })])]);
      prisma.userGoals.findUnique.mockResolvedValue(makeGoals({ kcalMin: 1800, kcalMax: 2200 }));
      prisma.workoutSession.findFirst.mockResolvedValue(null);
      weightLogs.getLatest.mockResolvedValue(null);
      stepLogs.getStepsForDate.mockResolvedValue({ steps: 0, logCount: 0, sources: [] });

      const result = await service.today(ctx);

      expect(result.nutrition.onTrack).toBe(false);
    });

    it('returns onTrack=null when user has no goals configured', async () => {
      prisma.meal.findMany.mockResolvedValue([]);
      prisma.userGoals.findUnique.mockResolvedValue(null);
      prisma.workoutSession.findFirst.mockResolvedValue(null);
      weightLogs.getLatest.mockResolvedValue(null);
      stepLogs.getStepsForDate.mockResolvedValue({ steps: 0, logCount: 0, sources: [] });

      const result = await service.today(ctx);

      expect(result.nutrition.onTrack).toBeNull();
    });

    it('flags stepsGoalReached based on the daily target', async () => {
      prisma.meal.findMany.mockResolvedValue([]);
      prisma.userGoals.findUnique.mockResolvedValue(makeGoals({ dailyStepsTarget: 8000 }));
      prisma.workoutSession.findFirst.mockResolvedValue(null);
      weightLogs.getLatest.mockResolvedValue(null);
      stepLogs.getStepsForDate.mockResolvedValue({ steps: 8500, logCount: 1, sources: ['MANUAL'] });

      const result = await service.today(ctx);

      expect(result.steps.today).toBe(8500);
      expect(result.steps.target).toBe(8000);
      expect(result.steps.goalReached).toBe(true);
      expect(result.steps.logged).toBe(true);
    });

    it('returns steps.goalReached=null and target=null when no step target is set', async () => {
      prisma.meal.findMany.mockResolvedValue([]);
      prisma.userGoals.findUnique.mockResolvedValue(makeGoals({ dailyStepsTarget: null }));
      prisma.workoutSession.findFirst.mockResolvedValue(null);
      weightLogs.getLatest.mockResolvedValue(null);
      stepLogs.getStepsForDate.mockResolvedValue({ steps: 5000, logCount: 1, sources: ['MANUAL'] });

      const result = await service.today(ctx);

      expect(result.steps.target).toBeNull();
      expect(result.steps.goalReached).toBeNull();
    });

    it('marks completedToday=true when a workoutSession was completed today', async () => {
      prisma.meal.findMany.mockResolvedValue([]);
      prisma.userGoals.findUnique.mockResolvedValue(null);
      prisma.workoutSession.findFirst
        .mockResolvedValueOnce(null) // sessionInProgress
        .mockResolvedValueOnce({ id: 's1', completedAt: new Date('2026-01-15T18:00:00Z') });
      weightLogs.getLatest.mockResolvedValue(null);
      stepLogs.getStepsForDate.mockResolvedValue({ steps: 0, logCount: 0, sources: [] });

      const result = await service.today(ctx);

      expect(result.workout.completedToday).toBe(true);
      expect(result.workout.sessionInProgress).toBeNull();
    });

    it('exposes the in-progress session when one exists', async () => {
      const sessionInProgress = { id: 's-active', startedAt: new Date('2026-01-15T17:00:00Z') };
      prisma.meal.findMany.mockResolvedValue([]);
      prisma.userGoals.findUnique.mockResolvedValue(null);
      prisma.workoutSession.findFirst
        .mockResolvedValueOnce(sessionInProgress)
        .mockResolvedValueOnce(null);
      weightLogs.getLatest.mockResolvedValue(null);
      stepLogs.getStepsForDate.mockResolvedValue({ steps: 0, logCount: 0, sources: [] });

      const result = await service.today(ctx);

      expect(result.workout.sessionInProgress).toEqual(sessionInProgress);
    });

    it('preenche plannedToday com o plano do bloco de periodização ativo', async () => {
      // O campo era `null` fixo até a #145. Quem preenche é o bloco — e é por isso
      // que ele passa pelo `getActive`, que já devolve `null` para bloco vencido:
      // um card prometendo o treino de um mês atrás é pior que card nenhum.
      prisma.meal.findMany.mockResolvedValue([]);
      prisma.userGoals.findUnique.mockResolvedValue(null);
      prisma.workoutSession.findFirst.mockResolvedValue(null);
      weightLogs.getLatest.mockResolvedValue(null);
      stepLogs.getStepsForDate.mockResolvedValue({ steps: 0, logCount: 0, sources: [] });
      trainingBlocks.getActive.mockResolvedValue({ planId: 'plan-1', planName: 'Push' });

      const result = await service.today(ctx);

      expect(result.workout.plannedToday).toEqual({ planId: 'plan-1', name: 'Push' });
      expect(trainingBlocks.getActive).toHaveBeenCalledWith(ctx);
    });

    it('mantém plannedToday nulo quando o bloco ativo periodiza treino livre', async () => {
      // Bloco sem plano não tem nome de treino para prometer; prometer o do bloco
      // mandaria a pessoa procurar uma tela que não existe.
      prisma.meal.findMany.mockResolvedValue([]);
      prisma.userGoals.findUnique.mockResolvedValue(null);
      prisma.workoutSession.findFirst.mockResolvedValue(null);
      weightLogs.getLatest.mockResolvedValue(null);
      stepLogs.getStepsForDate.mockResolvedValue({ steps: 0, logCount: 0, sources: [] });
      trainingBlocks.getActive.mockResolvedValue({ planId: null, planName: null });

      const result = await service.today(ctx);

      expect(result.workout.plannedToday).toBeNull();
    });

    it('mantém plannedToday nulo quando não há bloco ativo', async () => {
      prisma.meal.findMany.mockResolvedValue([]);
      prisma.userGoals.findUnique.mockResolvedValue(null);
      prisma.workoutSession.findFirst.mockResolvedValue(null);
      weightLogs.getLatest.mockResolvedValue(null);
      stepLogs.getStepsForDate.mockResolvedValue({ steps: 0, logCount: 0, sources: [] });

      const result = await service.today(ctx);

      expect(result.workout.plannedToday).toBeNull();
    });

    it('marks weight.loggedToday=true when the latest log is within today (UTC)', async () => {
      prisma.meal.findMany.mockResolvedValue([]);
      prisma.userGoals.findUnique.mockResolvedValue(null);
      prisma.workoutSession.findFirst.mockResolvedValue(null);
      weightLogs.getLatest.mockResolvedValue({
        weightKg: 80,
        loggedAt: new Date('2026-01-15T08:00:00Z'),
      });
      stepLogs.getStepsForDate.mockResolvedValue({ steps: 0, logCount: 0, sources: [] });

      const result = await service.today(ctx);

      expect(result.weight.loggedToday).toBe(true);
      expect(result.weight.latest?.weightKg).toBe(80);
    });

    it('marks weight.loggedToday=false when the latest log is from a previous day', async () => {
      prisma.meal.findMany.mockResolvedValue([]);
      prisma.userGoals.findUnique.mockResolvedValue(null);
      prisma.workoutSession.findFirst.mockResolvedValue(null);
      weightLogs.getLatest.mockResolvedValue({
        weightKg: 80,
        loggedAt: new Date('2026-01-10T08:00:00Z'),
      });
      stepLogs.getStepsForDate.mockResolvedValue({ steps: 0, logCount: 0, sources: [] });

      const result = await service.today(ctx);

      expect(result.weight.loggedToday).toBe(false);
      expect(result.weight.latest?.weightKg).toBe(80);
    });

    describe('streaks e conquistas', () => {
      const baselineTodayMocks = () => {
        prisma.meal.findMany.mockResolvedValue([]);
        prisma.userGoals.findUnique.mockResolvedValue(null);
        prisma.workoutSession.findFirst.mockResolvedValue(null);
        weightLogs.getLatest.mockResolvedValue(null);
        stepLogs.getStepsForDate.mockResolvedValue({ steps: 0, logCount: 0, sources: [] });
      };

      it('entrega o resumo de sequências que o StreakService calculou', async () => {
        baselineTodayMocks();
        streaks.compute.mockResolvedValue({
          ...RESUMO_DE_STREAK,
          activeDays: { ...STREAK_VAZIO, periodos: 12, faltasUsadas: 1, faltasPermitidas: 2 },
        });

        const result = await service.today(ctx);

        expect(result.streak.activeDays.periodos).toBe(12);
        expect(result.streak.activeDays.faltasUsadas).toBe(1);
      });

      it('não faz uma consulta por dia para calcular sequência', async () => {
        // O laço antigo chamava `meal.count` até 60 vezes e `workoutSession.count` até 12, dentro
        // do `today()`. Contar as chamadas aqui é o que impede o padrão de voltar por descuido.
        baselineTodayMocks();

        await service.today(ctx);

        expect(prisma.meal.count).not.toHaveBeenCalled();
        expect(prisma.workoutSession.count).not.toHaveBeenCalled();
        expect(stepLogs.getStepsForDate).toHaveBeenCalledTimes(1);
        expect(streaks.compute).toHaveBeenCalledTimes(1);
      });

      it('LÊ as conquistas sem desbloquear nada', async () => {
        // `GET /api/dashboard/today` e a tool `get_today_summary` (`readOnlyHint: true`) são
        // caminho de leitura. Avaliar aqui gravava até 7 linhas em `UserAchievement` numa
        // pergunta como "quanto comi hoje?" — a anotação passava a mentir e o GET deixava de
        // ser seguro. Quem desbloqueia é `refresh_achievements`, que se declara escrita.
        baselineTodayMocks();
        achievements.list.mockResolvedValue([
          {
            key: 'first_meal',
            title: 'Primeira refeição',
            description: '',
            unlockedAt: null,
            context: null,
          },
        ]);

        const result = await service.today(ctx);

        expect(achievements.evaluate).not.toHaveBeenCalled();
        expect(achievements.list).toHaveBeenCalledWith(ctx);
        expect(result.achievements).toHaveLength(1);
      });

      it('conquista que explode não derruba o dashboard', async () => {
        // Conquista é enfeite; dashboard é o produto. Sem este caso, um erro na leitura viraria
        // 500 na cara de quem só queria ver as calorias do dia.
        baselineTodayMocks();
        achievements.list.mockRejectedValue(new Error('banco fora do ar'));

        const result = await service.today(ctx);

        expect(result.achievements).toEqual([]);
        expect(result.nutrition.mealsLogged).toBe(0);
      });
    });
  });

  describe('week', () => {
    const stubWeek = () => {
      prisma.meal.findMany.mockResolvedValue([]);
      prisma.userGoals.findUnique.mockResolvedValue(null);
      prisma.workoutSession.findMany.mockResolvedValue([]);
      prisma.weightLog.findMany.mockResolvedValue([]);
      stepLogs.getStepsForDate.mockResolvedValue({ steps: 0, logCount: 0, sources: [] });
    };

    it('computes weekStart (Monday) and weekEnd (Sunday) from today', async () => {
      stubWeek();

      const result = await service.week(ctx);

      expect(result.weekStart).toBe('2026-01-12');
      expect(result.weekEnd).toBe('2026-01-18');
    });

    it('computes avg kcal/protein and counts days within calorie goal range', async () => {
      prisma.meal.findMany.mockResolvedValue([
        makeMeal([makeItem({ kcal: 2000, proteinG: 100 })], new Date('2026-01-12T12:00:00Z')),
        makeMeal([makeItem({ kcal: 1500, proteinG: 80 })], new Date('2026-01-13T12:00:00Z')),
        makeMeal([makeItem({ kcal: 2500, proteinG: 120 })], new Date('2026-01-14T12:00:00Z')),
      ]);
      prisma.userGoals.findUnique.mockResolvedValue(makeGoals({ kcalMin: 1800, kcalMax: 2200 }));
      prisma.workoutSession.findMany.mockResolvedValue([]);
      prisma.weightLog.findMany.mockResolvedValue([]);
      stepLogs.getStepsForDate.mockResolvedValue({ steps: 0, logCount: 0, sources: [] });

      const result = await service.week(ctx);

      expect(result.nutrition.avgKcal).toBeCloseTo(2000);
      expect(result.nutrition.avgProteinG).toBeCloseTo(100);
      expect(result.nutrition.daysOnTrack).toBe(1);
    });

    it('separates cardio and strength volume by exercise.muscleGroup', async () => {
      prisma.meal.findMany.mockResolvedValue([]);
      prisma.userGoals.findUnique.mockResolvedValue(null);
      prisma.workoutSession.findMany.mockResolvedValue([
        {
          id: 's1',
          startedAt: new Date('2026-01-13T09:00:00Z'),
          plan: { name: 'Push A' },
          sets: [
            {
              weightKg: 100,
              reps: 5,
              durationSeconds: null,
              distanceMeters: null,
              exercise: { muscleGroup: 'chest' },
            },
            {
              weightKg: 80,
              reps: 8,
              durationSeconds: null,
              distanceMeters: null,
              exercise: { muscleGroup: 'shoulders' },
            },
          ],
        },
        {
          id: 's2',
          startedAt: new Date('2026-01-14T09:00:00Z'),
          plan: { name: '5K Run' },
          sets: [
            {
              weightKg: null,
              reps: null,
              durationSeconds: 1800,
              distanceMeters: 5000,
              exercise: { muscleGroup: 'cardio' },
            },
          ],
        },
      ]);
      prisma.weightLog.findMany.mockResolvedValue([]);
      stepLogs.getStepsForDate.mockResolvedValue({ steps: 0, logCount: 0, sources: [] });

      const result = await service.week(ctx);

      expect(result.workouts.completed).toBe(2);
      const strengthSession = result.workouts.sessions.find((s) => s.planName === 'Push A');
      expect(strengthSession?.volumeKg).toBe(1140);
      expect(result.cardio.sessionCount).toBe(1);
      expect(result.cardio.totalDurationSeconds).toBe(1800);
      expect(result.cardio.totalDistanceMeters).toBe(5000);
    });

    it('sums step totals across the 7-day window and counts goal-hit days', async () => {
      prisma.meal.findMany.mockResolvedValue([]);
      prisma.userGoals.findUnique.mockResolvedValue(makeGoals({ dailyStepsTarget: 8000 }));
      prisma.workoutSession.findMany.mockResolvedValue([]);
      prisma.weightLog.findMany.mockResolvedValue([]);
      stepLogs.getStepsForDate
        .mockResolvedValueOnce({ steps: 9000, logCount: 1, sources: [] })
        .mockResolvedValueOnce({ steps: 6000, logCount: 1, sources: [] })
        .mockResolvedValueOnce({ steps: 10000, logCount: 1, sources: [] })
        .mockResolvedValueOnce({ steps: 8000, logCount: 1, sources: [] })
        .mockResolvedValueOnce({ steps: 4000, logCount: 1, sources: [] })
        .mockResolvedValueOnce({ steps: 8500, logCount: 1, sources: [] })
        .mockResolvedValueOnce({ steps: 5000, logCount: 1, sources: [] });

      const result = await service.week(ctx);

      expect(result.steps.totalSteps).toBe(50500);
      expect(result.steps.avgDaily).toBeCloseTo(50500 / 7);
      expect(result.steps.daysWithGoalReached).toBe(4);
      expect(result.steps.target).toBe(8000);
    });

    it('computes weight delta as currentKg − startKg over the week', async () => {
      prisma.meal.findMany.mockResolvedValue([]);
      prisma.userGoals.findUnique.mockResolvedValue(null);
      prisma.workoutSession.findMany.mockResolvedValue([]);
      prisma.weightLog.findMany.mockResolvedValue([
        { weightKg: 80, loggedAt: new Date('2026-01-12T08:00:00Z') },
        { weightKg: 79.2, loggedAt: new Date('2026-01-18T08:00:00Z') },
      ]);
      stepLogs.getStepsForDate.mockResolvedValue({ steps: 0, logCount: 0, sources: [] });

      const result = await service.week(ctx);

      expect(result.weight.startKg).toBe(80);
      expect(result.weight.currentKg).toBe(79.2);
      expect(result.weight.deltaKg).toBeCloseTo(-0.8);
    });

    it('returns null weight delta when there are no weight logs in the window', async () => {
      stubWeek();

      const result = await service.week(ctx);

      expect(result.weight.startKg).toBeNull();
      expect(result.weight.currentKg).toBeNull();
      expect(result.weight.deltaKg).toBeNull();
    });

    it('filters meals/sessions/weight queries by userId (isolation boundary)', async () => {
      stubWeek();

      await service.week(ctx);

      expect(prisma.meal.findMany.mock.calls[0][0].where.userId).toBe('user-A');
      expect(prisma.workoutSession.findMany.mock.calls[0][0].where.userId).toBe('user-A');
      expect(prisma.weightLog.findMany.mock.calls[0][0].where.userId).toBe('user-A');
    });
  });
});
