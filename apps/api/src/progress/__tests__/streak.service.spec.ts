import { StreakService } from '../streak.service';
import { JANELA_DIAS, JANELA_SEMANAS } from '../helpers/compute-streak';
import { dateInTz } from '../helpers/date-tz';
import type { PrismaService } from '../../common/prisma.service';

/**
 * Este spec usa os helpers de fuso **de verdade** — não mocka `../helpers/date-tz`.
 *
 * É a mesma disciplina de `dashboard-date-bounds.spec.ts`, e pelo mesmo motivo: sob o mock
 * daquele outro spec, `dayBoundsInTz(ymd)` e `new Date(`${ymd}T00:00:00Z`)` dão o mesmo instante,
 * então o código certo e o código com bug de fuso ficam indistinguíveis. Streak é justamente onde
 * um erro de fuso não aparece como número errado, e sim como sequência furada.
 *
 * O relógio é fixado com fake timers para que "hoje" não dependa do dia em que a suíte roda.
 */
describe('StreakService', () => {
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
    stepsTarget?: number | null;
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
      userGoals: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            dados.stepsTarget === null || dados.stepsTarget === undefined
              ? null
              : { dailyStepsTarget: dados.stepsTarget },
          ),
      },
    };
    return { prisma, service: new StreakService(prisma as unknown as PrismaService) };
  }

  /** Instante correspondente a `hora` local de `dia` dias atrás, no fuso dado. */
  function localHaDias(dias: number, hora: string, timezone: string): Date {
    const offsetMs = timezone === TOKYO ? -9 * 3600_000 : 3 * 3600_000;
    const base = new Date(AGORA.getTime() - dias * 86_400_000);
    const ymd = dateInTz(base, timezone);
    return new Date(new Date(`${ymd}T${hora}:00.000Z`).getTime() + offsetMs);
  }

  describe('o dia é o do usuário, não o do UTC', () => {
    it('o jantar das 23h30 em São Paulo conta no dia em que foi comido', () => {
      // 23h30 em São Paulo é 02h30 UTC do dia SEGUINTE. Agrupar pelo instante bruto jogaria a
      // refeição para amanhã e furaria a sequência de quem janta tarde — todo santo dia.
      const meals = [0, 1, 2, 3].map((d) => localHaDias(d, '23:30', SP));

      const { service } = build({ meals });

      return service.compute({ userId: 'user-A', timezone: SP }).then((r) => {
        expect(r.nutritionDays.periodos).toBe(4);
        expect(r.nutritionDays.faltasUsadas).toBe(0);
      });
    });

    it('a refeição da meia-noite local conta um dia só, não dois', () => {
      // `dayBoundsInTz` devolve `end` como a meia-noite SEGUINTE. Com `lte` (e com agrupamento
      // por instante) o registro da virada pertenceria aos dois dias, inventando um dia ativo —
      // e num streak com tolerância isso devolve falta que não deveria existir.
      const meiaNoite = localHaDias(2, '00:00', SP);

      const { service } = build({ meals: [meiaNoite] });

      return service.compute({ userId: 'user-A', timezone: SP }).then((r) => {
        expect(r.nutritionDays.periodos).toBe(1);
      });
    });

    it('o horário de verão não faz o dia de 23h valer menos que um dia', async () => {
      // Chile mudou o relógio em 2026-09-06. O dia curto e o dia longo continuam valendo 1.
      const SANTIAGO = 'America/Santiago';
      jest.setSystemTime(new Date('2026-09-09T15:00:00.000Z'));
      const meals = [
        new Date('2026-09-09T15:00:00.000Z'),
        new Date('2026-09-08T15:00:00.000Z'),
        new Date('2026-09-07T15:00:00.000Z'),
        new Date('2026-09-06T15:00:00.000Z'),
        new Date('2026-09-05T15:00:00.000Z'),
      ];

      const { service } = build({ meals });
      const r = await service.compute({ userId: 'user-A', timezone: SANTIAGO });

      expect(r.nutritionDays.periodos).toBe(5);
    });
  });

  describe('a semana de treino respeita o fuso do usuário', () => {
    it('o treino de segunda 07h em Tóquio conta na semana corrente', async () => {
      // O caso que zerava a sequência de quem não faltou: segunda 07:00 em Tóquio é domingo
      // 22:00 UTC, e uma janela montada em UTC joga a sessão para a semana anterior.
      const segundaDeManha = new Date('2026-01-12T07:00:00.000+09:00');

      const { service } = build({ sessions: [segundaDeManha] });
      const r = await service.compute({ userId: 'user-A', timezone: TOKYO });

      expect(r.workoutWeeks.periodos).toBe(1);
      // Sem esta linha o caso passa igual com o bug: agrupando em UTC a sessão cai na semana
      // ANTERIOR, o tamanho continua 1 e só este sinal denuncia que a semana corrente ficou vazia.
      expect(r.workoutWeeks.periodoCorrenteEmAberto).toBe(false);
    });

    it('o treino de domingo 22h em São Paulo conta na semana que terminou', async () => {
      // O espelho do caso acima: domingo 22:00 em São Paulo é segunda 01:00 UTC. Contar pelo
      // instante bruto empurraria a sessão para a semana seguinte.
      const domingoDeNoite = new Date('2026-01-11T22:00:00.000-03:00');

      const { service } = build({ sessions: [domingoDeNoite] });
      const r = await service.compute({ userId: 'user-A', timezone: SP });

      // A semana corrente (12/01) fica sem treino, mas ela ainda não acabou: a sequência é de
      // uma semana, a que terminou no domingo.
      expect(r.workoutWeeks.periodos).toBe(1);
      expect(r.workoutWeeks.periodoCorrenteEmAberto).toBe(true);
    });

    it('em UTC+14 a semana corrente não é a de amanhã', async () => {
      // `weekStartInTz(new Date(`${hoje}T12:00:00Z`), tz)` é um round-trip: monta meio-dia UTC a
      // partir de um YMD que já está no fuso do usuário. Em Kiritimati (UTC+14) meio-dia UTC de
      // domingo já é segunda local, e a semana "corrente" vira a que ainda não começou — o treino
      // desta semana passa a contar como semana passada e a de agora aparece vazia.
      const KIRITIMATI = 'Pacific/Kiritimati';
      // Domingo 16:00 local (= domingo 02:00 UTC).
      jest.setSystemTime(new Date('2026-01-18T02:00:00.000Z'));
      // Quarta-feira desta mesma semana local.
      const quarta = new Date('2026-01-13T22:00:00.000Z');

      const { service } = build({ sessions: [quarta] });
      const r = await service.compute({ userId: 'user-A', timezone: KIRITIMATI });

      expect(r.workoutWeeks.periodos).toBe(1);
      expect(r.workoutWeeks.periodoCorrenteEmAberto).toBe(false);
    });

    it('uma semana perdida no meio não zera a sequência de semanas', async () => {
      const sessions = [0, 1, 3, 4].map(
        (semanas) => new Date(AGORA.getTime() - semanas * 7 * 86_400_000),
      );

      const { service } = build({ sessions });
      const r = await service.compute({ userId: 'user-A', timezone: SP });

      expect(r.workoutWeeks.periodos).toBe(5);
      expect(r.workoutWeeks.faltasUsadas).toBe(1);
    });
  });

  describe('dia ativo é o OR das três pernas', () => {
    it('treinar salva o dia sem refeição registrada', async () => {
      // É o antídoto do risco de produto que a issue levanta: se treinar já salva o dia, não há
      // incentivo a inventar refeição só para manter o número.
      const { service } = build({
        meals: [localHaDias(0, '12:00', SP), localHaDias(2, '12:00', SP)],
        sessions: [localHaDias(1, '18:00', SP)],
      });

      const r = await service.compute({ userId: 'user-A', timezone: SP });

      expect(r.activeDays.periodos).toBe(3);
      expect(r.activeDays.faltasUsadas).toBe(0);
      // A perna de nutrição sozinha precisou gastar a falta que o OR dispensou.
      expect(r.nutritionDays.faltasUsadas).toBe(1);
    });

    it('bater a meta de passos salva o dia', async () => {
      const dias = [0, 1, 2].map((d) => dateInTz(new Date(AGORA.getTime() - d * 86_400_000), SP));

      const { service } = build({
        steps: dias.map((date) => ({ date, steps: 9000 })),
        stepsTarget: 8000,
      });
      const r = await service.compute({ userId: 'user-A', timezone: SP });

      expect(r.stepsDays.periodos).toBe(3);
      expect(r.activeDays.periodos).toBe(3);
    });

    it('ADR 007: o valor do dia é o MAIOR log, não a soma', async () => {
      // Dois logs de 5000 num dia com meta de 8000 não batem a meta. Somar (13 mil) acenderia um
      // dia ativo que não existiu, e o usuário ganharia sequência por sincronizar duas fontes.
      const hoje = dateInTz(AGORA, SP);

      const { service } = build({
        steps: [
          { date: hoje, steps: 5000 },
          { date: hoje, steps: 5000 },
        ],
        stepsTarget: 8000,
      });
      const r = await service.compute({ userId: 'user-A', timezone: SP });

      expect(r.stepsDays.periodos).toBe(0);
    });

    it('sem linha de UserGoals, passos não entram no dia ativo e nada estoura', async () => {
      // Estado de todo usuário novo. `dailyStepsTarget` tem default no schema, então `null` só
      // acontece quando a linha inteira não existe — e sem meta declarada não há o que bater.
      const hoje = dateInTz(AGORA, SP);

      const { service } = build({ steps: [{ date: hoje, steps: 30_000 }], stepsTarget: null });
      const r = await service.compute({ userId: 'user-A', timezone: SP });

      expect(r.stepsTargetSet).toBe(false);
      expect(r.stepsDays.periodos).toBe(0);
      expect(r.activeDays.periodos).toBe(0);
    });
  });

  describe('custo e isolamento', () => {
    it('faz três consultas de dado, não uma por dia', async () => {
      // O laço antigo fazia um `count` por dia: ~120 idas ao banco a cada abertura do app, e
      // ampliar a janela piorava linearmente. Contar as chamadas é a única forma de esse ganho
      // não voltar atrás em silêncio na próxima refatoração.
      const { service, prisma } = build({ meals: [AGORA] });

      await service.compute({ userId: 'user-A', timezone: SP });

      expect(prisma.meal.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.workoutSession.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.stepLog.findMany).toHaveBeenCalledTimes(1);
    });

    it('filtra todas as consultas por userId (fronteira de isolamento)', async () => {
      const { service, prisma } = build({});

      await service.compute({ userId: 'user-A', timezone: SP });

      expect(prisma.meal.findMany.mock.calls[0][0].where.userId).toBe('user-A');
      expect(prisma.workoutSession.findMany.mock.calls[0][0].where.userId).toBe('user-A');
      expect(prisma.stepLog.findMany.mock.calls[0][0].where.userId).toBe('user-A');
      expect(prisma.userGoals.findUnique.mock.calls[0][0].where.userId).toBe('user-A');
    });

    it('usa `lt` no fim da janela, nunca `lte`', async () => {
      const { service, prisma } = build({});

      await service.compute({ userId: 'user-A', timezone: TOKYO });

      const refeicoes = prisma.meal.findMany.mock.calls[0][0].where.eatenAt;
      expect(refeicoes).toHaveProperty('lt');
      expect(refeicoes).not.toHaveProperty('lte');
      // A meia-noite de Tóquio é 15:00 UTC. Se a janela fosse montada em UTC isto daria 0.
      expect(refeicoes.gte.getUTCHours()).toBe(15);
    });

    it('varre a janela declarada, não a antiga de 60 dias', async () => {
      // A janela é um teto silencioso, e a tolerância faz bater nele muito mais: com faltas
      // toleradas as sequências vivem mais, e 60 dias limitaria justamente o usuário engajado.
      const { service, prisma } = build({});

      await service.compute({ userId: 'user-A', timezone: SP });

      const { gte, lt } = prisma.meal.findMany.mock.calls[0][0].where.eatenAt;
      expect(Math.round((lt.getTime() - gte.getTime()) / 86_400_000)).toBe(JANELA_DIAS);

      const sessoes = prisma.workoutSession.findMany.mock.calls[0][0].where.completedAt;
      const semanas = (sessoes.lt.getTime() - sessoes.gte.getTime()) / (7 * 86_400_000);
      expect(semanas).toBeGreaterThanOrEqual(JANELA_SEMANAS - 1);
    });
  });
});
