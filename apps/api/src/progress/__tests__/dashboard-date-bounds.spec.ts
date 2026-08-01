import { DashboardService } from '../dashboard.service';
import { dayBoundsInTz } from '../helpers/date-tz';
import type { PrismaService } from '../../common/prisma.service';
import type { StepLogService } from '../step-log.service';
import type { WeightLogService } from '../weight-log.service';
import type { WaterLogService } from '../water-log.service';

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

    const service = new DashboardService(
      prisma as unknown as PrismaService,
      stepLogs as unknown as StepLogService,
      weightLogs as unknown as WeightLogService,
      waterLogs as unknown as WaterLogService,
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

  describe('a semana de treino respeita o fuso do usuário', () => {
    it('começa na meia-noite local, não na meia-noite UTC', async () => {
      // O bug: a data de início da semana era calculada no fuso do usuário, mas os limites da
      // consulta eram montados como `new Date(`${ws}T00:00:00Z`)` — meia-noite UTC.
      //
      // Em Tóquio (UTC+9) isso desloca a janela em 9 horas. Quem treinou segunda às 07:00 local
      // (= domingo 22:00 UTC) caía antes do `gte` e era contado na semana anterior. Resultado:
      // a sequência de semanas zerava para quem não faltou.
      const { service, prisma } = build();
      prisma.workoutSession.count.mockResolvedValue(1);

      await service.today({ userId: 'user-A', timezone: TOKYO });

      const where = prisma.workoutSession.count.mock.calls[0][0].where;
      const start: Date = where.completedAt.gte;

      // Meia-noite em Tóquio é 15:00 UTC do dia anterior. Se o código ainda usasse
      // `T00:00:00Z`, isto daria 0.
      expect(start.getUTCHours()).toBe(15);
    });

    it('cobre a semana inteira: 7 dias exatos entre os limites', async () => {
      // O código antigo usava `${we}T23:59:59Z` como fim, o que deixa o último segundo do dia
      // de fora e ainda mistura fusos. A janela correta é [início do dia 1, início do dia 8).
      const { service, prisma } = build();
      prisma.workoutSession.count.mockResolvedValue(1);

      await service.today({ userId: 'user-A', timezone: TOKYO });

      const where = prisma.workoutSession.count.mock.calls[0][0].where;
      expect(where.completedAt).toHaveProperty('lt');
      expect(where.completedAt.lt.getTime() - where.completedAt.gte.getTime()).toBe(7 * 86_400_000);
    });

    it('um treino de segunda de manhã em Tóquio cai dentro da janela', async () => {
      // O caso concreto que o bug quebrava, escrito como instante e não como abstração.
      const { service, prisma } = build();
      prisma.workoutSession.count.mockResolvedValue(1);

      await service.today({ userId: 'user-A', timezone: TOKYO });

      const { gte, lt } = prisma.workoutSession.count.mock.calls[0][0].where.completedAt;

      // 07:00 de segunda em Tóquio, expresso em UTC.
      const mondayMorningTokyo = new Date(gte.getTime() + 7 * 3600 * 1000);
      expect(mondayMorningTokyo >= gte && mondayMorningTokyo < lt).toBe(true);
    });
  });

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
