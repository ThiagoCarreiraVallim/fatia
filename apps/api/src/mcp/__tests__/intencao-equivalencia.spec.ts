import type { TestingModule } from '@nestjs/testing';
import type { McpToolContext } from '../../common/decorators/tool.decorator';
import { PrismaService } from '../../common/prisma.service';
import { CompleteGoalTool } from '../../goals/mcp/complete-goal.tool';
import { ListGoalsTool } from '../../goals/mcp/list-goals.tool';
import { GetNutritionGoalsTool } from '../../nutrition/mcp/get-nutrition-goals.tool';
import { GetNutritionHistoryTool } from '../../nutrition/mcp/get-nutrition-history.tool';
import { GetNutritionSummaryTool } from '../../nutrition/mcp/get-nutrition-summary.tool';
import { ListMealsTool } from '../../nutrition/mcp/list-meals.tool';
import { LogMealTool } from '../../nutrition/mcp/log-meal.tool';
import { SearchFoodTool } from '../../nutrition/mcp/search-food.tool';
import { SetNutritionGoalsTool } from '../../nutrition/mcp/set-nutrition-goals.tool';
import { UpdateMealItemTool } from '../../nutrition/mcp/update-meal-item.tool';
import { GetStepsForDateTool } from '../../progress/mcp/get-steps-for-date.tool';
import { GetStepsHistoryTool } from '../../progress/mcp/get-steps-history.tool';
import { GetStrengthProgressTool } from '../../progress/mcp/get-strength-progress.tool';
import { GetStreakTool } from '../../progress/mcp/get-streak.tool';
import { GetVolumeProgressTool } from '../../progress/mcp/get-volume-progress.tool';
import { GetWaterForDateTool } from '../../progress/mcp/get-water-for-date.tool';
import { GetWaterProgressTool } from '../../progress/mcp/get-water-progress.tool';
import { GetWeekSummaryTool } from '../../progress/mcp/get-week-summary.tool';
import { GetWeightProgressTool } from '../../progress/mcp/get-weight-progress.tool';
import { ListAchievementsTool } from '../../progress/mcp/list-achievements.tool';
import { LogStepsTool } from '../../progress/mcp/log-steps.tool';
import { LogWaterTool } from '../../progress/mcp/log-water.tool';
import { LogWeightTool } from '../../progress/mcp/log-weight.tool';
import { GetStudentProgressTool } from '../../sharing/mcp/get-student-progress.tool';
import { GrantDataSharingTool } from '../../sharing/mcp/grant-data-sharing.tool';
import { ListDataAccessLogTool } from '../../sharing/mcp/list-data-access-log.tool';
import { ListDataSharingTool } from '../../sharing/mcp/list-data-sharing.tool';
import { ListMyGroupsTool } from '../../sharing/mcp/list-my-groups.tool';
import { ListMyStudentsTool } from '../../sharing/mcp/list-my-students.tool';
import { RevokeDataSharingTool } from '../../sharing/mcp/revoke-data-sharing.tool';
import { AddExerciseToPlanTool } from '../../workout/mcp/add-exercise-to-plan.tool';
import { FinishWorkoutSessionTool } from '../../workout/mcp/finish-workout-session.tool';
import { GetActiveWorkoutSessionTool } from '../../workout/mcp/get-active-workout-session.tool';
import { GetExerciseDetailsTool } from '../../workout/mcp/get-exercise-details.tool';
import { GetLastSetForExerciseTool } from '../../workout/mcp/get-last-set-for-exercise.tool';
import { GetLoadPrescriptionTool } from '../../workout/mcp/get-load-prescription.tool';
import { GetPersonalRecordTool } from '../../workout/mcp/get-personal-record.tool';
import { ListWorkoutPlansTool } from '../../workout/mcp/list-workout-plans.tool';
import { ListWorkoutSessionsTool } from '../../workout/mcp/list-workout-sessions.tool';
import { LogSetTool } from '../../workout/mcp/log-set.tool';
import { SearchExerciseTool } from '../../workout/mcp/search-exercise.tool';
import { StartWorkoutSessionTool } from '../../workout/mcp/start-workout-session.tool';
import { EditWorkoutPlanTool } from '../intent/tools/edit-workout-plan.tool';
import { FindMealsTool } from '../intent/tools/find-meals.tool';
import { FinishWorkoutTool } from '../intent/tools/finish-workout.tool';
import { FixMealTool } from '../intent/tools/fix-meal.tool';
import { GetDayOverviewTool } from '../intent/tools/get-day-overview.tool';
import { GetExerciseInsightTool } from '../intent/tools/get-exercise-insight.tool';
import { GetGoalsOverviewTool } from '../intent/tools/get-goals-overview.tool';
import { GetPeriodOverviewTool } from '../intent/tools/get-period-overview.tool';
import { GetSharingOverviewTool } from '../intent/tools/get-sharing-overview.tool';
import { GetStudentOverviewTool } from '../intent/tools/get-student-overview.tool';
import { MarkGoalDoneTool } from '../intent/tools/mark-goal-done.tool';
import { RecordMealTool } from '../intent/tools/record-meal.tool';
import { RecordMeasurementTool } from '../intent/tools/record-measurement.tool';
import { RecordSetsTool } from '../intent/tools/record-sets.tool';
import { ShareMyDataTool } from '../intent/tools/share-my-data.tool';
import { StartWorkoutTool } from '../intent/tools/start-workout.tool';
import { StopSharingTool } from '../intent/tools/stop-sharing.tool';
import { UpdateMyTargetsTool } from '../intent/tools/update-my-targets.tool';
import {
  apagarContaDeAvaliacao,
  garantirCatalogos,
  semearContaDeAvaliacao,
  type ContasDeAvaliacao,
} from './support/conta-de-avaliacao';
import {
  executor,
  fixarRelogio,
  montarModuloDeTools,
  normalizar,
  type Executar,
} from './support/modulo-de-tools';

/**
 * Cada tool de intenção devolve o mesmo que a sequência de pernas que ela compõe, sobre o
 * mesmo seed da conta de avaliação — o braço A feito à mão, perna por perna, como o agente
 * faria, com as mesmas tools de entidade que o `/mcp` serve.
 *
 * É a prova de que o braço B não tem lógica de negócio própria (ADR 006): se uma tool de
 * intenção calculasse algo que nenhuma perna calcula, a sequência de pernas não chegaria no
 * mesmo resultado. A cola que sobra — data relativa, nome no lugar de id, mescla parcial,
 * soma de escopos — aparece aqui escrita do lado do braço A, que é onde o agente a faria.
 *
 * As escritas rodam cada lado sobre um seed novo e comparam a resposta e o estado relido
 * depois; os ids mudam de um seed para o outro, e `normalizar` os troca por marcadores.
 */

const ROTULO = 'equivalencia';
/** Uma quarta-feira, à tarde em Cuiabá. */
const AGORA = new Date('2026-09-23T19:00:00Z');
const HOJE = '2026-09-23';
const ONTEM = '2026-09-22';

describe('tool de intenção = sequência de pernas, sobre o mesmo seed', () => {
  const prisma = new PrismaService();
  let modulo: TestingModule;
  let $: Executar;
  let contas: ContasDeAvaliacao;
  let usuario: McpToolContext;
  let profissional: McpToolContext;

  /** Semeia de novo, com o relógio fixo, e devolve os contextos das duas personas. */
  function semear(estados: string[] = []) {
    contas = semearContaDeAvaliacao({ rotulo: ROTULO, agora: AGORA, estados });
    usuario = { userId: contas.usuarioId, timezone: contas.fuso };
    profissional = { userId: contas.profissionalId, timezone: contas.fuso };
  }

  /** Uma escrita: o lado B e o lado A, cada um num seed novo, com o estado relido depois. */
  async function escrita(
    estados: string[],
    ladoB: () => Promise<unknown>,
    ladoA: () => Promise<unknown>,
    reler: () => Promise<unknown>,
  ) {
    semear(estados);
    const b = { resposta: await ladoB(), depois: await reler() };
    semear(estados);
    const a = { resposta: await ladoA(), depois: await reler() };
    expect(normalizar(b)).toEqual(normalizar(a));
  }

  /** "Supino" é o supino que a pessoa treina: a busca e, entre os 5 primeiros, o já treinado. */
  async function exercicioPeloNome(nome: string) {
    const candidatos = (await $(SearchExerciseTool, { q: nome, limit: 5 }, usuario)) as Array<{
      id: number;
    }>;
    for (const c of candidatos) {
      if (await $(GetLastSetForExerciseTool, { exerciseId: c.id }, usuario)) return c;
    }
    return candidatos[0];
  }

  beforeAll(async () => {
    await garantirCatalogos(prisma);
    modulo = await montarModuloDeTools();
    $ = executor(modulo);
    fixarRelogio(AGORA);
  }, 300_000);

  afterAll(async () => {
    jest.useRealTimers();
    await apagarContaDeAvaliacao(prisma, ROTULO);
    await modulo.close();
    await prisma.$disconnect();
  });

  describe('leituras', () => {
    beforeAll(() => semear(), 120_000);

    it('get_day_overview', async () => {
      const b = await $(GetDayOverviewTool, { day: 'yesterday' }, usuario);
      const a = {
        date: ONTEM,
        nutrition: await $(GetNutritionSummaryTool, { date: ONTEM }, usuario),
        goals: await $(GetNutritionGoalsTool, {}, usuario),
        water: await $(GetWaterForDateTool, { date: ONTEM }, usuario),
        steps: await $(GetStepsForDateTool, { date: ONTEM }, usuario),
        streak: await $(GetStreakTool, {}, usuario),
        workouts: await $(ListWorkoutSessionsTool, { date: ONTEM }, usuario),
      };
      expect(normalizar(b)).toEqual(normalizar(a));
    });

    it('get_period_overview, numa janela que toda perna aceita', async () => {
      const b = await $(GetPeriodOverviewTool, { period: 'last_30_days' }, usuario);
      const janelas = { nutrition: 30, water: 30, steps: 30, weight: 30, volume: 30 };
      const a = {
        period: 'last_30_days',
        days: 30,
        janelas,
        goals: await $(GetNutritionGoalsTool, {}, usuario),
        nutrition: await $(GetNutritionHistoryTool, { days: 30 }, usuario),
        water: await $(GetWaterProgressTool, { days: 30 }, usuario),
        steps: await $(GetStepsHistoryTool, { days: 30 }, usuario),
        weight: await $(GetWeightProgressTool, { days: 30 }, usuario),
        volume: await $(GetVolumeProgressTool, { days: 30 }, usuario),
      };
      expect(normalizar(b)).toEqual(normalizar(a));
    });

    it('get_period_overview, na semana corrente', async () => {
      const b = await $(GetPeriodOverviewTool, { period: 'this_week' }, usuario);
      const a = {
        period: 'this_week',
        goals: await $(GetNutritionGoalsTool, {}, usuario),
        week: await $(GetWeekSummaryTool, {}, usuario),
      };
      expect(normalizar(b)).toEqual(normalizar(a));
    });

    it('find_meals', async () => {
      const b = await $(FindMealsTool, { day: 'yesterday', mealType: 'LUNCH' }, usuario);
      const doDia = (await $(ListMealsTool, { date: ONTEM, limit: 50 }, usuario)) as Array<{
        mealType: string;
      }>;
      const a = { date: ONTEM, meals: doDia.filter((m) => m.mealType === 'LUNCH') };
      expect(normalizar(b)).toEqual(normalizar(a));
      expect((b as { meals: unknown[] }).meals).toHaveLength(1);
    });

    it('get_exercise_insight', async () => {
      const b = await $(GetExerciseInsightTool, { exercise: 'supino reto' }, usuario);
      const { id } = await exercicioPeloNome('supino reto');
      const a = {
        exercise: await $(GetExerciseDetailsTool, { exerciseId: id }, usuario),
        lastSession: await $(GetLastSetForExerciseTool, { exerciseId: id }, usuario),
        personalRecord: await $(GetPersonalRecordTool, { exerciseId: id }, usuario),
        progress: await $(
          GetStrengthProgressTool,
          { exerciseId: id, days: 90, metric: 'max_weight' },
          usuario,
        ),
        nextLoad: await $(GetLoadPrescriptionTool, { exerciseId: id }, usuario),
      };
      expect(normalizar(b)).toEqual(normalizar(a));
      expect((a.lastSession as unknown) !== null).toBe(true);
    });

    it('get_goals_overview', async () => {
      const b = await $(GetGoalsOverviewTool, {}, usuario);
      const achievements = (await $(ListAchievementsTool, {}, usuario)) as Array<{
        unlockedAt: string | null;
      }>;
      const desde = AGORA.getTime() - 7 * 24 * 60 * 60 * 1000;
      const a = {
        goals: await $(ListGoalsTool, {}, usuario),
        recentAchievements: achievements.filter(
          (c) => c.unlockedAt !== null && Date.parse(c.unlockedAt) >= desde,
        ),
        achievements,
      };
      expect(normalizar(b)).toEqual(normalizar(a));
    });

    it('get_sharing_overview', async () => {
      const b = await $(GetSharingOverviewTool, {}, usuario);
      const log = (await $(ListDataAccessLogTool, {}, usuario)) as Array<{ at: Date }>;
      const desde = AGORA.getTime() - 30 * 24 * 60 * 60 * 1000;
      const a = {
        groups: await $(ListMyGroupsTool, {}, usuario),
        sharing: await $(ListDataSharingTool, {}, usuario),
        accessLogDays: 30,
        accessLog: log.filter((l) => new Date(l.at).getTime() >= desde),
      };
      expect(normalizar(b)).toEqual(normalizar(a));
      // O seed tem uma leitura há 5 dias e uma há 40: só a primeira cabe na janela.
      expect((b as { accessLog: unknown[] }).accessLog).toHaveLength(1);
    });

    it('get_student_overview', async () => {
      const b = await $(GetStudentOverviewTool, { student: 'Ana', scope: 'WORKOUT' }, profissional);
      const alunos = (await $(ListMyStudentsTool, {}, profissional)) as Array<{
        membershipId: string;
        name: string;
      }>;
      const ana = alunos.find((x) => x.name.startsWith('Ana'))!;
      const a = {
        student: ana,
        scope: 'WORKOUT',
        progress: await $(
          GetStudentProgressTool,
          { membershipId: ana.membershipId, scope: 'WORKOUT', days: 30 },
          profissional,
        ),
      };
      expect(normalizar(b)).toEqual(normalizar(a));
    });
  });

  describe('escritas', () => {
    const refeicoesDeHoje = () => $(ListMealsTool, { date: HOJE, limit: 50 }, usuario);

    it('record_meal', async () => {
      await escrita(
        [],
        async () => {
          const r = (await $(
            RecordMealTool,
            { mealType: 'SNACK', items: [{ food: 'banana prata', grams: 100 }] },
            usuario,
          )) as { meal: unknown };
          return r.meal;
        },
        async () => {
          const [banana] = (await $(
            SearchFoodTool,
            { q: 'banana prata', limit: 1 },
            usuario,
          )) as Array<{
            id: number;
          }>;
          return $(
            LogMealTool,
            {
              mealType: 'SNACK',
              eatenAt: AGORA.toISOString(),
              items: [{ foodId: banana.id, grams: 100 }],
            },
            usuario,
          );
        },
        refeicoesDeHoje,
      );
    }, 120_000);

    it('fix_meal', async () => {
      await escrita(
        [],
        async () => {
          const r = (await $(
            FixMealTool,
            { day: 'today', mealType: 'LUNCH', item: 'feijão', grams: 150 },
            usuario,
          )) as { item: unknown };
          return r.item;
        },
        async () => {
          const doDia = (await refeicoesDeHoje()) as Array<{
            mealType: string;
            items: Array<{ id: string; foodName: string }>;
          }>;
          const almoco = doDia.find((m) => m.mealType === 'LUNCH')!;
          const feijao = almoco.items.find((i) => i.foodName.startsWith('Feijão'))!;
          return $(UpdateMealItemTool, { id: feijao.id, grams: 150 }, usuario);
        },
        refeicoesDeHoje,
      );
    }, 120_000);

    it('update_my_targets', async () => {
      await escrita(
        [],
        async () =>
          ((await $(UpdateMyTargetsTool, { proteinMinG: 180 }, usuario)) as { goals: unknown })
            .goals,
        async () => {
          const atuais = (await $(GetNutritionGoalsTool, {}, usuario)) as Record<string, number>;
          const {
            kcalMin,
            kcalMax,
            proteinMaxG,
            carbsMinG,
            carbsMaxG,
            fatMinG,
            fatMaxG,
            weeklyWorkouts,
            dailyStepsTarget,
            dailyWaterTargetMl,
          } = atuais;
          return $(
            SetNutritionGoalsTool,
            {
              kcalMin,
              kcalMax,
              proteinMinG: 180,
              proteinMaxG,
              carbsMinG,
              carbsMaxG,
              fatMinG,
              fatMaxG,
              weeklyWorkouts,
              dailyStepsTarget,
              dailyWaterTargetMl,
            },
            usuario,
          );
        },
        () => $(GetNutritionGoalsTool, {}, usuario),
      );
    }, 120_000);

    it.each([
      ['water_ml', 500, LogWaterTool, { ml: 500, date: HOJE }],
      ['steps', 8500, LogStepsTool, { steps: 8500, date: ONTEM }],
      ['weight_kg', 82.4, LogWeightTool, { weightKg: 82.4 }],
    ] as const)(
      'record_measurement (%s)',
      async (kind, value, perna, input) => {
        const day = kind === 'steps' ? 'yesterday' : undefined;
        await escrita(
          [],
          () => $(RecordMeasurementTool, { kind, value, ...(day && { day }) }, usuario),
          () => $(perna, input, usuario),
          async () => ({
            agua: await $(GetWaterForDateTool, { date: HOJE }, usuario),
            passos: await $(GetStepsForDateTool, { date: ONTEM }, usuario),
            peso: await $(GetWeightProgressTool, { days: 14 }, usuario),
          }),
        );
      },
      120_000,
    );

    it('start_workout', async () => {
      await escrita(
        [],
        () => $(StartWorkoutTool, { plan: 'peito' }, usuario),
        async () => {
          const planos = (await $(ListWorkoutPlansTool, {}, usuario)) as Array<{
            id: string;
            name: string;
            exercises: Array<{ exerciseId: number }>;
          }>;
          const plano = planos.find((p) => p.name.startsWith('Peito'))!;
          const session = await $(StartWorkoutSessionTool, { planId: plano.id }, usuario);
          const exercises = [];
          for (const item of plano.exercises) {
            exercises.push({
              ...item,
              lastSet: await $(GetLastSetForExerciseTool, { exerciseId: item.exerciseId }, usuario),
            });
          }
          return { session, plan: { id: plano.id, name: plano.name, exercises } };
        },
        () => $(GetActiveWorkoutSessionTool, {}, usuario),
      );
    }, 120_000);

    it('record_sets', async () => {
      await escrita(
        ['sessao_ativa'],
        async () =>
          (
            (await $(
              RecordSetsTool,
              { exercise: 'supino reto', sets: 3, reps: 10, weightKg: 60 },
              usuario,
            )) as { sets: unknown }
          ).sets,
        async () => {
          const ativa = (await $(GetActiveWorkoutSessionTool, {}, usuario)) as { id: string };
          const { id } = await exercicioPeloNome('supino reto');
          const series = [];
          for (let i = 0; i < 3; i++) {
            series.push(
              await $(
                LogSetTool,
                { sessionId: ativa.id, exerciseId: id, reps: 10, weightKg: 60 },
                usuario,
              ),
            );
          }
          return series;
        },
        () => $(GetActiveWorkoutSessionTool, {}, usuario),
      );
    }, 120_000);

    it('finish_workout', async () => {
      await escrita(
        ['sessao_ativa'],
        () => $(FinishWorkoutTool, {}, usuario),
        async () => {
          const ativa = (await $(GetActiveWorkoutSessionTool, {}, usuario)) as { id: string };
          return $(FinishWorkoutSessionTool, { sessionId: ativa.id }, usuario);
        },
        () => $(GetActiveWorkoutSessionTool, {}, usuario),
      );
    }, 120_000);

    it('edit_workout_plan', async () => {
      const relerPlanos = () => $(ListWorkoutPlansTool, {}, usuario);
      await escrita(
        [],
        async () =>
          (
            (await $(
              EditWorkoutPlanTool,
              { plan: 'perna', add: [{ exercise: 'leg press' }] },
              usuario,
            )) as {
              added: Array<Record<string, unknown>>;
            }
          ).added.map(({ defaultsApplied: _d, ...resto }) => resto),
        async () => {
          const planos = (await relerPlanos()) as Array<{
            id: string;
            name: string;
            exercises: Array<{ order: number }>;
          }>;
          const perna = planos.find((p) => p.name === 'Perna')!;
          const { id } = await exercicioPeloNome('leg press');
          return [
            await $(
              AddExerciseToPlanTool,
              {
                planId: perna.id,
                exerciseId: id,
                order: Math.max(0, ...perna.exercises.map((e) => e.order)) + 1,
                targetSets: 3,
                targetReps: '8-12',
              },
              usuario,
            ),
          ];
        },
        relerPlanos,
      );
    }, 120_000);

    it('mark_goal_done', async () => {
      await escrita(
        [],
        () => $(MarkGoalDoneTool, { goal: 'correr 5 km' }, usuario),
        async () => {
          const ativas = (await $(ListGoalsTool, { status: 'active' }, usuario)) as Array<{
            id: string;
            title: string;
          }>;
          const meta = ativas.find((g) => g.title === 'Correr 5 km')!;
          return $(CompleteGoalTool, { goalId: meta.id }, usuario);
        },
        () => $(ListGoalsTool, {}, usuario),
      );
    }, 120_000);

    it('stop_sharing', async () => {
      await escrita(
        [],
        async () => {
          const { linkId, revokedAt } = (await $(
            StopSharingTool,
            { professional: 'Carlos' },
            usuario,
          )) as {
            linkId: string;
            revokedAt: Date;
          };
          return { linkId, revokedAt };
        },
        async () => {
          const vinculos = (await $(ListDataSharingTool, {}, usuario)) as Array<{
            linkId: string;
            professionalName: string;
          }>;
          const carlos = vinculos.find((v) => v.professionalName.startsWith('Carlos'))!;
          return $(RevokeDataSharingTool, { linkId: carlos.linkId }, usuario);
        },
        () => $(ListDataSharingTool, {}, usuario),
      );
    }, 120_000);

    it('share_my_data soma a categoria às que o profissional já tem', async () => {
      await escrita(
        [],
        () => $(ShareMyDataTool, { professional: 'Carlos', scopes: ['NUTRITION'] }, usuario),
        async () => {
          const vinculos = (await $(ListDataSharingTool, {}, usuario)) as Array<{
            professionalMembershipId: string;
            professionalName: string;
            scopes: string[];
          }>;
          const carlos = vinculos.find((v) => v.professionalName.startsWith('Carlos'))!;
          return $(
            GrantDataSharingTool,
            {
              professionalMembershipId: carlos.professionalMembershipId,
              scopes: [...carlos.scopes, 'NUTRITION'],
            },
            usuario,
          );
        },
        () => $(ListDataSharingTool, {}, usuario),
      );
      const [vinculo] = (await $(ListDataSharingTool, {}, usuario)) as Array<{ scopes: string[] }>;
      expect([...vinculo.scopes].sort()).toEqual(['NUTRITION', 'WORKOUT']);
    }, 120_000);
  });
});
