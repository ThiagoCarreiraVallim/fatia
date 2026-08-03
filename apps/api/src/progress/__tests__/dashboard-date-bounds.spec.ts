import { DashboardService } from '../dashboard.service';
import { dayBoundsInTz } from '../helpers/date-tz';
import type { PrismaService } from '../../common/prisma.service';
import type { StepLogService } from '../step-log.service';
import type { WeightLogService } from '../weight-log.service';
import type { WaterLogService } from '../water-log.service';
import type { StreakService, StreakSummary } from '../streak.service';
import type { AchievementService } from '../achievement.service';
import type { TrainingBlockService } from '../../workout/training-block.service';

/**
 * Este spec vive num arquivo separado do `dashboard.service.spec.ts` por um motivo que é o
 * próprio assunto do teste: **aquele spec mocka `../helpers/date-tz`**, e o mock devolve limites
 * em UTC, ignorando o fuso.
 *
 * Sob aquele mock, `dayBoundsInTz(ymd)` e `new Date(`${ymd}T00:00:00Z`)` produzem exatamente o
 * mesmo instante. Ou seja: o código correto e o código com bug de fuso são indistinguíveis, e a
 * suíte passa verde nos dois casos. Foi assim que os dois defeitos abaixo sobreviveram.
 *
 * Aqui os helpers são os **de verdade**, e o que se observa é o `where` que chega ao Prisma.
 */
describe('DashboardService — fronteiras de dia e semana', () => {
  /** Tóquio é UTC+9 sem horário de verão: erro de fuso vira offset limpo de 9h. */
  const TOKYO = 'Asia/Tokyo';

  function build() {
    const prisma = {
      meal: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      userGoals: { findUnique: jest.fn().mockResolvedValue(null) },
      workoutSession: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      weightLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const stepLogs = { getStepsForDate: jest.fn().mockResolvedValue({ steps: 0 }) };
    const weightLogs = { getLatest: jest.fn().mockResolvedValue(null) };
    const waterLogs = { getForDate: jest.fn().mockResolvedValue({ totalMl: 0, logCount: 0 }) };
    const vazio = {
      periodos: 0,
      faltasUsadas: 0,
      faltasPermitidas: 0,
      periodoCorrenteEmAberto: false,
      janelaEsgotada: false,
    };
    const resumo: StreakSummary = {
      activeDays: vazio,
      nutritionDays: vazio,
      workoutWeeks: vazio,
      stepsDays: vazio,
      stepsTargetSet: false,
    };
    const streaks = { compute: jest.fn().mockResolvedValue(resumo) };
    const achievements = { evaluate: jest.fn().mockResolvedValue([]) };
    const trainingBlocks = { getActive: jest.fn().mockResolvedValue(null) };

    const service = new DashboardService(
      prisma as unknown as PrismaService,
      stepLogs as unknown as StepLogService,
      weightLogs as unknown as WeightLogService,
      waterLogs as unknown as WaterLogService,
      streaks as unknown as StreakService,
      achievements as unknown as AchievementService,
      trainingBlocks as unknown as TrainingBlockService,
    );

    return { service, prisma };
  }

  describe('a virada do dia pertence a um dia só', () => {
    it('usa `lt` no fim do dia, não `lte`', async () => {
      // `dayBoundsInTz` devolve `end` = meia-noite do dia SEGUINTE. Com `lte`, o instante exato
      // da virada casa nos dois dias: a mesma refeição soma no dia que acabou e no que começou.
      //
      // O resto do produto (nutrition-summary, nutrient-target, meal) sempre usou `lt`. Só o
      // dashboard divergia — então o mesmo dado dava dois totais diferentes conforme a tela.
      const { service, prisma } = build();

      await service.today({ userId: 'user-A', timezone: TOKYO });

      const where = prisma.meal.findMany.mock.calls[0][0].where;
      expect(where.eatenAt).toHaveProperty('lt');
      expect(where.eatenAt).not.toHaveProperty('lte');

      // E o limite tem que ser exatamente 24h depois do início — nem 1ms a mais.
      expect(where.eatenAt.lt.getTime() - where.eatenAt.gte.getTime()).toBe(86_400_000);
    });

    it('aplica a mesma fronteira à sessão de treino concluída no dia', async () => {
      const { service, prisma } = build();

      await service.today({ userId: 'user-A', timezone: TOKYO });

      // O `findFirst` de sessão concluída é o segundo; o primeiro busca sessão em andamento.
      const completed = prisma.workoutSession.findFirst.mock.calls
        .map((c) => c[0].where)
        .find((w) => w.completedAt && typeof w.completedAt === 'object');

      expect(completed?.completedAt).toHaveProperty('lt');
      expect(completed?.completedAt).not.toHaveProperty('lte');
    });
  });

  // A janela semanal de treino saiu daqui: quem a monta agora é o `StreakService`, e os casos
  // (segunda 07:00 em Tóquio dentro da janela, `lt` no fim, sete dias exatos) vivem em
  // `streak.service.spec.ts` — que também usa os helpers reais, pelo mesmo motivo deste arquivo.

  describe('o helper de limites', () => {
    it('devolve `end` como a meia-noite seguinte, e não o último instante do dia', () => {
      // Documenta o contrato de que o `lt` depende. Se alguém mudar `dayBoundsInTz` para
      // devolver 23:59:59, todo caller com `lt` passa a perder o último segundo do dia —
      // e isso tem que quebrar aqui, não em produção.
      const { start, end } = dayBoundsInTz('2026-01-15', TOKYO);

      expect(end.getTime() - start.getTime()).toBe(86_400_000);
      expect(start.toISOString()).toBe('2026-01-14T15:00:00.000Z');
    });
  });
});
