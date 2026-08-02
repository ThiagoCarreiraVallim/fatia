import { AchievementService } from '../achievement.service';
import { ACHIEVEMENT_KEYS } from '../achievement-catalog';
import type { PrismaService } from '../../common/prisma.service';
import type { StreakService, StreakSummary } from '../streak.service';

/**
 * Os helpers de fuso são os **reais** (nenhum `jest.mock` de `date-tz` aqui): `first_full_week`
 * agrupa sessões por semana no fuso do usuário, e um mock de fuso tornaria o bug invisível.
 */
describe('AchievementService', () => {
  const SP = 'America/Sao_Paulo';
  const ctx = { userId: 'user-A', timezone: SP };

  function streakDe(dias: number): StreakSummary {
    const vazio = {
      periodos: 0,
      faltasUsadas: 0,
      faltasPermitidas: 0,
      periodoCorrenteEmAberto: false,
      janelaEsgotada: false,
    };
    return {
      activeDays: { ...vazio, periodos: dias },
      nutritionDays: vazio,
      workoutWeeks: vazio,
      stepsDays: vazio,
      stepsTargetSet: false,
    };
  }

  function build(dados: {
    desbloqueadas?: Array<{ key: string; unlockedAt: Date; context: unknown }>;
    primeiraRefeicao?: Date | null;
    primeiroTreino?: Date | null;
    primeiroPlano?: Date | null;
    setsPorSessao?: Array<{ sessionId: string; exerciseId: number; _max: { weightKg: number } }>;
    sessoes?: Array<{ id: string; startedAt: Date }>;
    weeklyWorkouts?: number | null;
    sessoesConcluidas?: Date[];
    /** Dias da sequência que o `StreakService` devolve — `streak_7`/`streak_30` leem daqui. */
    streakDias?: number;
  }) {
    const criadas: unknown[] = [];
    const prisma = {
      userAchievement: {
        findMany: jest.fn().mockResolvedValue(dados.desbloqueadas ?? []),
        createMany: jest.fn().mockImplementation(({ data }: { data: unknown[] }) => {
          criadas.push(...data);
          return Promise.resolve({ count: data.length });
        }),
      },
      meal: {
        findFirst: jest
          .fn()
          .mockResolvedValue(dados.primeiraRefeicao ? { eatenAt: dados.primeiraRefeicao } : null),
      },
      workoutPlan: {
        findFirst: jest
          .fn()
          .mockResolvedValue(dados.primeiroPlano ? { createdAt: dados.primeiroPlano } : null),
      },
      workoutSession: {
        findFirst: jest
          .fn()
          .mockResolvedValue(dados.primeiroTreino ? { completedAt: dados.primeiroTreino } : null),
        findMany: jest.fn().mockImplementation(({ select }: { select: Record<string, boolean> }) =>
          // O snapshot faz duas consultas diferentes em `workoutSession.findMany`: as sessões com
          // data de início (para o recorde) e as concluídas (para a semana completa).
          Promise.resolve(
            select.startedAt
              ? (dados.sessoes ?? [])
              : (dados.sessoesConcluidas ?? []).map((completedAt) => ({ completedAt })),
          ),
        ),
      },
      sessionSet: { groupBy: jest.fn().mockResolvedValue(dados.setsPorSessao ?? []) },
      exercise: { findUnique: jest.fn().mockResolvedValue({ name: 'Supino reto' }) },
      userGoals: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            dados.weeklyWorkouts === null || dados.weeklyWorkouts === undefined
              ? null
              : { weeklyWorkouts: dados.weeklyWorkouts },
          ),
      },
    };
    const streaks = { compute: jest.fn().mockResolvedValue(streakDe(dados.streakDias ?? 0)) };
    const service = new AchievementService(
      prisma as unknown as PrismaService,
      streaks as unknown as StreakService,
    );
    return { service, prisma, streaks, criadas };
  }

  it('devolve o catálogo inteiro, inclusive o que ainda falta', async () => {
    // A tela precisa mostrar o alvo, não só o troféu. Devolver só o desbloqueado deixaria a
    // pessoa sem saber o que fazer a seguir.
    const { service } = build({});

    const lista = await service.evaluate(ctx);

    expect(lista.map((a) => a.key)).toEqual([...ACHIEVEMENT_KEYS]);
    expect(lista.every((a) => a.unlockedAt === null)).toBe(true);
  });

  it('avaliar duas vezes seguidas não duplica', async () => {
    // A avaliação roda a cada abertura do app. Sem idempotência isso viraria uma linha nova por
    // abertura, e o `unlockedAt` andaria para frente todo dia.
    const primeira = new Date('2026-01-02T12:00:00.000Z');
    const { service, prisma, criadas } = build({ primeiraRefeicao: primeira });

    await service.evaluate(ctx);
    expect(criadas).toHaveLength(1);

    prisma.userAchievement.findMany.mockResolvedValue([
      { key: 'first_meal', unlockedAt: primeira, context: null },
    ]);
    const segunda = await service.evaluate(ctx);

    expect(prisma.userAchievement.createMany).toHaveBeenCalledTimes(1);
    expect(segunda.find((a) => a.key === 'first_meal')?.unlockedAt).toBe(primeira.toISOString());
  });

  it('grava com skipDuplicates — duas abas abrindo o app ao mesmo tempo não estouram', async () => {
    const { service, prisma } = build({ primeiraRefeicao: new Date('2026-01-02T12:00:00.000Z') });

    await service.evaluate(ctx);

    expect(prisma.userAchievement.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it('carimba a data do evento, não a de hoje', async () => {
    // A avaliação é retroativa por construção: quem já treinava antes do deploy desbloqueia na
    // primeira abertura. Carimbar `now()` contaria "primeiro treino: hoje" para quem treina há
    // um ano.
    const antigo = new Date('2025-03-11T10:00:00.000Z');
    const { service, criadas } = build({ primeiroTreino: antigo });

    await service.evaluate(ctx);

    const treino = criadas.find((c) => (c as { key: string }).key === 'first_workout') as {
      unlockedAt: Date;
    };
    expect(treino.unlockedAt).toEqual(antigo);
  });

  it('não avalia de novo o que já está desbloqueado', async () => {
    // É o que segura o custo: a consulta cara de recorde some do caminho quente assim que
    // `first_pr` cai. Sem isso, todo `today()` pagaria o `groupBy` de séries para sempre.
    const { service, prisma } = build({
      desbloqueadas: ACHIEVEMENT_KEYS.map((key) => ({
        key,
        unlockedAt: new Date('2026-01-01T00:00:00.000Z'),
        context: null,
      })),
    });

    await service.evaluate(ctx);

    expect(prisma.sessionSet.groupBy).not.toHaveBeenCalled();
    expect(prisma.meal.findFirst).not.toHaveBeenCalled();
    expect(prisma.userAchievement.createMany).not.toHaveBeenCalled();
  });

  describe('first_pr', () => {
    const sessoes = [
      { id: 's1', startedAt: new Date('2026-01-05T10:00:00.000Z') },
      { id: 's2', startedAt: new Date('2026-01-12T10:00:00.000Z') },
    ];

    it('não dispara só porque o usuário levantou peso uma vez', async () => {
      // Recorde é superação. Uma sessão só seria `first_workout` com outro nome.
      const { service } = build({
        sessoes: [sessoes[0]],
        setsPorSessao: [{ sessionId: 's1', exerciseId: 7, _max: { weightKg: 80 } }],
      });

      const lista = await service.evaluate(ctx);

      expect(lista.find((a) => a.key === 'first_pr')?.unlockedAt).toBeNull();
    });

    it('não dispara quando a carga só repetiu ou caiu', async () => {
      const { service } = build({
        sessoes,
        setsPorSessao: [
          { sessionId: 's1', exerciseId: 7, _max: { weightKg: 80 } },
          { sessionId: 's2', exerciseId: 7, _max: { weightKg: 80 } },
        ],
      });

      const lista = await service.evaluate(ctx);

      expect(lista.find((a) => a.key === 'first_pr')?.unlockedAt).toBeNull();
    });

    it('dispara quando uma sessão posterior supera a carga anterior', async () => {
      const { service, criadas } = build({
        sessoes,
        setsPorSessao: [
          { sessionId: 's1', exerciseId: 7, _max: { weightKg: 80 } },
          { sessionId: 's2', exerciseId: 7, _max: { weightKg: 85 } },
        ],
      });

      await service.evaluate(ctx);
      const pr = criadas.find((c) => (c as { key: string }).key === 'first_pr') as {
        unlockedAt: Date;
        context: { weightKg: number; exerciseName: string };
      };

      expect(pr.unlockedAt).toEqual(sessoes[1].startedAt);
      expect(pr.context.weightKg).toBe(85);
      expect(pr.context.exerciseName).toBe('Supino reto');
    });

    it('não confunde ordem de sessão com ordem de chegada da consulta', async () => {
      // O `groupBy` não promete ordem. Se o serviço confiasse na ordem das linhas, uma carga
      // maior numa sessão ANTERIOR seria lida como superação.
      const { service } = build({
        sessoes,
        setsPorSessao: [
          { sessionId: 's2', exerciseId: 7, _max: { weightKg: 80 } },
          { sessionId: 's1', exerciseId: 7, _max: { weightKg: 100 } },
        ],
      });

      const lista = await service.evaluate(ctx);

      expect(lista.find((a) => a.key === 'first_pr')?.unlockedAt).toBeNull();
    });

    it('não busca sessão nenhuma para quem nunca levantou peso', async () => {
      // `first_pr` é a conquista que mais demora a desbloquear, e para quem só registra refeição
      // ela nunca desbloqueia: fica pendente para sempre e é reavaliada a cada abertura do app.
      // Sem o corte, essa avaliação carregava TODAS as sessões do usuário para jogar fora.
      const { service, prisma } = build({ setsPorSessao: [] });

      await service.evaluate(ctx);

      expect(prisma.sessionSet.groupBy).toHaveBeenCalledTimes(1);
      const porRecorde = prisma.workoutSession.findMany.mock.calls.filter(
        ([arg]: [{ select: Record<string, boolean> }]) => arg.select.startedAt,
      );
      expect(porRecorde).toEqual([]);
    });

    it('busca só as sessões que têm série com carga', async () => {
      // O `where` sem `id` trazia sessão de cardio e sessão vazia, e crescia para sempre junto
      // com o histórico. Os ids saem do próprio `groupBy`, então nada é descartado em memória.
      const { service, prisma } = build({
        sessoes,
        setsPorSessao: [
          { sessionId: 's1', exerciseId: 7, _max: { weightKg: 80 } },
          { sessionId: 's1', exerciseId: 9, _max: { weightKg: 40 } },
          { sessionId: 's2', exerciseId: 7, _max: { weightKg: 85 } },
        ],
      });

      await service.evaluate(ctx);

      const [porRecorde] = prisma.workoutSession.findMany.mock.calls.filter(
        ([arg]: [{ select: Record<string, boolean> }]) => arg.select.startedAt,
      );
      // Sem duplicar `s1`, que aparece em duas linhas do `groupBy`.
      expect(porRecorde[0].where.id).toEqual({ in: ['s1', 's2'] });
      expect(porRecorde[0].where.userId).toBe('user-A');
    });
  });

  describe('first_full_week', () => {
    it('desbloqueia na primeira semana que bateu a meta', async () => {
      const { service, criadas } = build({
        weeklyWorkouts: 3,
        sessoesConcluidas: [
          new Date('2026-01-12T10:00:00.000Z'),
          new Date('2026-01-14T10:00:00.000Z'),
          new Date('2026-01-16T10:00:00.000Z'),
        ],
      });

      await service.evaluate(ctx);
      const semana = criadas.find((c) => (c as { key: string }).key === 'first_full_week') as {
        context: { weekStart: string; target: number };
      };

      expect(semana.context.weekStart).toBe('2026-01-12');
      expect(semana.context.target).toBe(3);
    });

    it('não soma treinos de semanas diferentes', async () => {
      const { service } = build({
        weeklyWorkouts: 3,
        sessoesConcluidas: [
          new Date('2026-01-06T10:00:00.000Z'),
          new Date('2026-01-13T10:00:00.000Z'),
          new Date('2026-01-20T10:00:00.000Z'),
        ],
      });

      const lista = await service.evaluate(ctx);

      expect(lista.find((a) => a.key === 'first_full_week')?.unlockedAt).toBeNull();
    });

    it('sem linha de UserGoals não desbloqueia — não há meta a bater', async () => {
      // Estado de todo usuário novo. Inventar um alvo padrão desbloquearia a conquista sozinho.
      const { service } = build({
        weeklyWorkouts: null,
        sessoesConcluidas: [
          new Date('2026-01-12T10:00:00.000Z'),
          new Date('2026-01-13T10:00:00.000Z'),
          new Date('2026-01-14T10:00:00.000Z'),
        ],
      });

      const lista = await service.evaluate(ctx);

      expect(lista.find((a) => a.key === 'first_full_week')?.unlockedAt).toBeNull();
    });
  });

  describe('streak_7 e streak_30', () => {
    it('usam a sequência com tolerância que o StreakService calcula', async () => {
      const { service, streaks } = build({ streakDias: 30 });

      const lista = await service.evaluate(ctx);

      expect(lista.find((a) => a.key === 'streak_7')?.unlockedAt).not.toBeNull();
      expect(lista.find((a) => a.key === 'streak_30')?.unlockedAt).not.toBeNull();
      // Uma vez só, mesmo com duas conquistas pedindo o mesmo dado: é o `umaVez` compartilhando
      // a promessa que impede as três consultas de streak de rodarem duas vezes.
      expect(streaks.compute).toHaveBeenCalledTimes(1);
      expect(streaks.compute).toHaveBeenCalledWith(ctx);
    });

    it('não desbloqueia streak_30 com 29 dias', async () => {
      const { service } = build({ streakDias: 29 });

      const lista = await service.evaluate(ctx);

      expect(lista.find((a) => a.key === 'streak_7')?.unlockedAt).not.toBeNull();
      expect(lista.find((a) => a.key === 'streak_30')?.unlockedAt).toBeNull();
    });

    it('não calcula a sequência quando as duas já estão desbloqueadas', async () => {
      // O caminho preguiçoso: no estado estável de quem usa o app há um mês, avaliar não custa
      // as três consultas de streak. Antes isso vinha de graça porque o dashboard entregava o
      // resumo pronto; agora quem segura o custo é o filtro de pendentes.
      const { service, streaks } = build({
        streakDias: 30,
        desbloqueadas: ['streak_7', 'streak_30'].map((key) => ({
          key,
          unlockedAt: new Date('2026-01-01T00:00:00.000Z'),
          context: null,
        })),
      });

      await service.evaluate(ctx);

      expect(streaks.compute).not.toHaveBeenCalled();
    });
  });

  describe('isolamento', () => {
    it('toda consulta filtra por userId', async () => {
      const { service, prisma } = build({
        sessoes: [{ id: 's1', startedAt: new Date('2026-01-05T10:00:00.000Z') }],
        setsPorSessao: [{ sessionId: 's1', exerciseId: 7, _max: { weightKg: 80 } }],
        weeklyWorkouts: 3,
      });

      await service.evaluate(ctx);

      expect(prisma.userAchievement.findMany.mock.calls[0][0].where.userId).toBe('user-A');
      expect(prisma.meal.findFirst.mock.calls[0][0].where.userId).toBe('user-A');
      expect(prisma.workoutPlan.findFirst.mock.calls[0][0].where.userId).toBe('user-A');
      expect(prisma.workoutSession.findFirst.mock.calls[0][0].where.userId).toBe('user-A');
      expect(prisma.userGoals.findUnique.mock.calls[0][0].where.userId).toBe('user-A');
      // O recorde filtra pela sessão, e é aí que um `where` frouxo daria série de outra conta.
      expect(prisma.sessionSet.groupBy.mock.calls[0][0].where.session.userId).toBe('user-A');
      for (const call of prisma.workoutSession.findMany.mock.calls) {
        expect(call[0].where.userId).toBe('user-A');
      }
    });

    it('`list` não desbloqueia nada', async () => {
      // `list_achievements` é `readOnlyHint: true`. Uma tool de leitura que grava seria uma
      // surpresa desagradável para quem lê a anotação.
      const { service, prisma } = build({ primeiraRefeicao: new Date('2026-01-02T12:00:00.000Z') });

      const lista = await service.list(ctx);

      expect(prisma.userAchievement.createMany).not.toHaveBeenCalled();
      expect(lista.find((a) => a.key === 'first_meal')?.unlockedAt).toBeNull();
    });
  });
});
