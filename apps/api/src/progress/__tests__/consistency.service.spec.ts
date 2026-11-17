import { ConsistencyService } from '../consistency.service';
import { JANELA_DIAS } from '../helpers/compute-streak';
import { addDaysIso, dateInTz } from '../helpers/date-tz';
import type { PrismaService } from '../../common/prisma.service';

/**
 * A sequência e a constância saem do mesmo serviço (#382): dia ativo = ao menos uma área
 * cumprida (refeição, treino, água na meta, passos na meta).
 *
 * Este spec usa os helpers de fuso **de verdade** — não mocka `../helpers/date-tz`. Sob mock,
 * `dayBoundsInTz(ymd)` e `new Date(`${ymd}T00:00:00Z`)` dão o mesmo instante, e o código certo e
 * o com bug de fuso ficam indistinguíveis. Sequência é onde erro de fuso não aparece como número
 * errado, e sim como sequência furada.
 *
 * O relógio é fixado com fake timers para que "hoje" não dependa do dia em que a suíte roda.
 */
describe('ConsistencyService', () => {
  const SP = 'America/Sao_Paulo';
  const TOKYO = 'Asia/Tokyo';

  /** Uma quinta-feira. Fixa o "hoje" de todos os casos abaixo. */
  const AGORA = new Date('2026-01-15T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(AGORA);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function build(dados: {
    meals?: Date[];
    sessions?: Date[];
    steps?: Array<{ date: string; steps: number }>;
    water?: Array<{ date: string; ml: number }>;
    goals?: { dailyStepsTarget: number; dailyWaterTargetMl: number; weeklyWorkouts: number } | null;
  }) {
    const prisma = {
      meal: {
        findMany: jest.fn().mockResolvedValue((dados.meals ?? []).map((eatenAt) => ({ eatenAt }))),
      },
      workoutSession: {
        findMany: jest
          .fn()
          .mockResolvedValue((dados.sessions ?? []).map((completedAt) => ({ completedAt }))),
      },
      stepLog: { findMany: jest.fn().mockResolvedValue(dados.steps ?? []) },
      waterLog: { findMany: jest.fn().mockResolvedValue(dados.water ?? []) },
      userGoals: { findUnique: jest.fn().mockResolvedValue(dados.goals ?? null) },
    };
    return { prisma, service: new ConsistencyService(prisma as unknown as PrismaService) };
  }

  const METAS = { dailyStepsTarget: 8000, dailyWaterTargetMl: 2000, weeklyWorkouts: 4 };

  /** Instante correspondente a `hora` local de `dia` dias atrás, no fuso dado. */
  function localHaDias(dias: number, hora: string, timezone: string): Date {
    const offsetMs = timezone === TOKYO ? -9 * 3600_000 : 3 * 3600_000;
    const base = new Date(AGORA.getTime() - dias * 86_400_000);
    const ymd = dateInTz(base, timezone);
    return new Date(new Date(`${ymd}T${hora}:00.000Z`).getTime() + offsetMs);
  }

  const diaLocal = (dias: number) => dateInTz(new Date(AGORA.getTime() - dias * 86_400_000), SP);
  const ctx = { userId: 'user-A', timezone: SP };

  describe('o dia é o do usuário, não o do UTC', () => {
    it('o jantar das 23h30 em São Paulo conta no dia em que foi comido', async () => {
      // 23h30 em São Paulo é 02h30 UTC do dia SEGUINTE. Agrupar pelo instante bruto jogaria a
      // refeição para amanhã e furaria a sequência de quem janta tarde — todo santo dia.
      const meals = [0, 1, 2, 3].map((d) => localHaDias(d, '23:30', SP));

      const r = await build({ meals }).service.streak(ctx);

      expect(r.activeDays.periodos).toBe(4);
      expect(r.activeDays.faltasUsadas).toBe(0);
    });

    it('a refeição da meia-noite local conta um dia só, não dois', async () => {
      // `dayBoundsInTz` devolve `end` como a meia-noite SEGUINTE. Com `lte` (e com agrupamento
      // por instante) o registro da virada pertenceria aos dois dias, inventando um dia ativo.
      const meiaNoite = localHaDias(2, '00:00', SP);

      const r = await build({ meals: [meiaNoite] }).service.streak(ctx);

      expect(r.activeDays.periodos).toBe(1);
    });

    it('o horário de verão não faz o dia de 23h valer menos que um dia', async () => {
      // Chile mudou o relógio em 2026-09-06. O dia curto e o dia longo continuam valendo 1.
      const SANTIAGO = 'America/Santiago';
      jest.setSystemTime(new Date('2026-09-09T15:00:00.000Z'));
      const meals = [9, 8, 7, 6, 5].map((d) => new Date(`2026-09-0${d}T15:00:00.000Z`));

      const r = await build({ meals }).service.streak({ userId: 'user-A', timezone: SANTIAGO });

      expect(r.activeDays.periodos).toBe(5);
    });

    it('o treino de domingo 22h em São Paulo conta no domingo', async () => {
      // Domingo 22:00 em São Paulo é segunda 01:00 UTC.
      jest.setSystemTime(new Date('2026-01-12T15:00:00.000Z')); // segunda
      const domingoDeNoite = new Date('2026-01-11T22:00:00.000-03:00');

      const r = await build({ sessions: [domingoDeNoite] }).service.report(ctx, 'month');

      const domingo = r.days.find((d) => d.date === '2026-01-11');
      expect(domingo?.workout).toBe(true);
      expect(r.days.find((d) => d.date === '2026-01-12')?.workout).toBe(false);
    });
  });

  describe('dia ativo é ao menos uma das quatro áreas', () => {
    it('treinar salva o dia sem refeição registrada', async () => {
      const { service } = build({
        meals: [localHaDias(0, '12:00', SP), localHaDias(2, '12:00', SP)],
        sessions: [localHaDias(1, '18:00', SP)],
      });

      const r = await service.streak(ctx);

      expect(r.activeDays.periodos).toBe(3);
      expect(r.activeDays.faltasUsadas).toBe(0);
    });

    it('a água na meta salva o dia (área nova da #382)', async () => {
      const { service } = build({
        water: [0, 1, 2].map((d) => ({ date: diaLocal(d), ml: 2000 })),
        goals: METAS,
      });

      const r = await service.streak(ctx);

      expect(r.activeDays.periodos).toBe(3);
    });

    it('a água do dia é a soma dos copos', async () => {
      const { service } = build({
        water: [
          { date: diaLocal(0), ml: 1000 },
          { date: diaLocal(0), ml: 1000 },
        ],
        goals: METAS,
      });

      const r = await service.report(ctx, 'month');

      expect(r.days.at(-1)).toMatchObject({ date: diaLocal(0), water: true, count: 1 });
    });

    it('bater a meta de passos salva o dia', async () => {
      const { service } = build({
        steps: [0, 1, 2].map((d) => ({ date: diaLocal(d), steps: 9000 })),
        goals: METAS,
      });

      const r = await service.streak(ctx);

      expect(r.activeDays.periodos).toBe(3);
    });

    it('ADR 007: o valor do dia de passos é o MAIOR log, não a soma', async () => {
      // Dois logs de 5000 num dia com meta de 8000 não batem a meta. Somar acenderia um dia
      // ativo que não existiu, e a pessoa ganharia sequência por sincronizar duas fontes.
      const { service } = build({
        steps: [
          { date: diaLocal(0), steps: 5000 },
          { date: diaLocal(0), steps: 5000 },
        ],
        goals: METAS,
      });

      const r = await service.streak(ctx);

      expect(r.activeDays.periodos).toBe(0);
    });

    it('sem linha de UserGoals, água e passos não entram no dia ativo e nada estoura', async () => {
      const { service } = build({
        steps: [{ date: diaLocal(0), steps: 30_000 }],
        water: [{ date: diaLocal(0), ml: 5000 }],
        goals: null,
      });

      const r = await service.streak(ctx);

      expect(r.activeDays.periodos).toBe(0);
    });
  });

  describe('report (Al-G12)', () => {
    it('devolve os dias do período com as áreas, os dias ativos e a sequência', async () => {
      const { service } = build({
        meals: [0, 1, 2].map((d) => localHaDias(d, '12:00', SP)),
        sessions: [localHaDias(1, '18:00', SP)],
        goals: METAS,
      });

      const r = await service.report(ctx, 'month');

      expect(r.range).toBe('month');
      expect(r.days).toHaveLength(30);
      expect(r.from).toBe(addDaysIso(diaLocal(0), -29));
      expect(r.to).toBe(diaLocal(0));
      expect(r.activeDays).toBe(3);
      expect(r.totalDays).toBe(30);
      expect(r.streak.periodos).toBe(3);
      expect(r.days.find((d) => d.date === diaLocal(1))?.count).toBe(2);
      expect(r.byArea.meal).toEqual({ days: 3, of: 30 });
      expect(r.byArea.workout).toEqual({ days: 1, of: 16 });
    });

    it('o recorde do período nunca é menor que a sequência atual', async () => {
      // A sequência atual é de 40 dias e começou antes do mês: o recorde do mês é ela inteira.
      const meals = Array.from({ length: 40 }, (_, d) => localHaDias(d, '12:00', SP));

      const r = await build({ meals }).service.report(ctx, 'month');

      expect(r.streak.periodos).toBe(40);
      expect(r.record).toBe(40);
    });

    it('o recorde é a maior sequência do período, mesmo que já tenha acabado', async () => {
      // 10 dias seguidos que terminaram há 12 dias, e 2 dias agora.
      const antigos = Array.from({ length: 10 }, (_, i) => localHaDias(12 + i, '12:00', SP));
      const recentes = [0, 1].map((d) => localHaDias(d, '12:00', SP));

      const r = await build({ meals: [...antigos, ...recentes] }).service.report(ctx, 'month');

      expect(r.streak.periodos).toBe(2);
      expect(r.record).toBe(10);
    });

    it('o ano lê um ano antes do período, para o recorde que começou antes dele', async () => {
      const { service, prisma } = build({});

      await service.report(ctx, 'year');

      const { gte, lt } = prisma.meal.findMany.mock.calls[0][0].where.eatenAt;
      expect(Math.round((lt.getTime() - gte.getTime()) / 86_400_000)).toBe(365 + JANELA_DIAS);
    });
  });

  describe('custo e isolamento', () => {
    it('faz uma consulta por fonte, não uma por dia', async () => {
      // O laço antigo fazia um `count` por dia: ~120 idas ao banco a cada abertura do app.
      const { service, prisma } = build({ meals: [AGORA] });

      await service.streak(ctx);

      expect(prisma.meal.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.workoutSession.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.stepLog.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.waterLog.findMany).toHaveBeenCalledTimes(1);
    });

    it('filtra todas as consultas por userId (fronteira de isolamento)', async () => {
      const { service, prisma } = build({});

      await service.report(ctx, 'quarter');

      expect(prisma.meal.findMany.mock.calls[0][0].where.userId).toBe('user-A');
      expect(prisma.workoutSession.findMany.mock.calls[0][0].where.userId).toBe('user-A');
      expect(prisma.stepLog.findMany.mock.calls[0][0].where.userId).toBe('user-A');
      expect(prisma.waterLog.findMany.mock.calls[0][0].where.userId).toBe('user-A');
      expect(prisma.userGoals.findUnique.mock.calls[0][0].where.userId).toBe('user-A');
    });

    it('usa `lt` no fim da janela, nunca `lte`', async () => {
      const { service, prisma } = build({});

      await service.streak({ userId: 'user-A', timezone: TOKYO });

      const refeicoes = prisma.meal.findMany.mock.calls[0][0].where.eatenAt;
      expect(refeicoes).toHaveProperty('lt');
      expect(refeicoes).not.toHaveProperty('lte');
      // A meia-noite de Tóquio é 15:00 UTC. Se a janela fosse montada em UTC isto daria 0.
      expect(refeicoes.gte.getUTCHours()).toBe(15);
    });

    it('a sequência varre 365 dias', async () => {
      // Literal de propósito: comparar contra `JANELA_DIAS` seria comparar a constante consigo
      // mesma, e baixá-la de volta deixaria este caso verde.
      const { service, prisma } = build({});

      await service.streak(ctx);

      const { gte, lt } = prisma.meal.findMany.mock.calls[0][0].where.eatenAt;
      expect(Math.round((lt.getTime() - gte.getTime()) / 86_400_000)).toBe(365);
    });
  });
});
