import { PrismaService } from '../../common/prisma.service';
import { OnboardingService } from '../onboarding.service';

/**
 * Onboarding salvo a cada passo (#371) no Postgres real: a etapa e o rascunho
 * voltam ao reabrir, a meta sugerida pela equipe vem do plano publicado da
 * comunidade, e o cartão "Primeiros passos" aparece no fim e some no dia
 * seguinte ao de tudo pronto.
 */
describe('onboarding salvo a cada passo (integração)', () => {
  const prisma = new PrismaService();
  const service = new OnboardingService(prisma);
  const TZ = 'America/Sao_Paulo';

  const stamp = `onb-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;

  async function pessoa(nome = 'Ana') {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: nome },
    });
    criados.push(user.id);
    return user.id;
  }

  const GOALS = {
    kcalMin: 1700,
    kcalMax: 1850,
    proteinMinG: 126,
    proteinMaxG: 154,
    carbsMinG: 115,
    carbsMaxG: 227,
    fatMinG: 49,
    fatMaxG: 69,
    weeklyWorkouts: 3,
    dailyWaterTargetMl: 2500,
    dailyStepsTarget: 9000,
  };

  /** Comunidade com a Helena (profissional) e a aluna ativa nela. */
  async function comunidadeCom(aluna: string) {
    const dono = await pessoa('Bruno');
    const helena = await pessoa('Helena Prado');
    const grupo = await prisma.group.create({
      data: { type: 'SPONSORED', name: 'Academia Demo', slug: `${stamp}-g${n}`, ownerId: dono },
    });
    grupos.push(grupo.id);
    await prisma.groupMembership.createMany({
      data: [
        { groupId: grupo.id, userId: dono, role: 'OWNER', status: 'ACTIVE' },
        { groupId: grupo.id, userId: helena, role: 'PROFESSIONAL', status: 'ACTIVE' },
        { groupId: grupo.id, userId: aluna, role: 'MEMBER', status: 'ACTIVE' },
      ],
    });
    return { grupo, helena };
  }

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  it('guarda a etapa, o perfil parcial e o rascunho, e devolve tudo ao reabrir', async () => {
    const ana = await pessoa();
    await service.saveProgress(ana, { step: 'objective', objective: 'LOSE' }, TZ);
    await service.saveProgress(
      ana,
      { step: 'body', sex: 'FEMALE', birthDate: '1994-03-12', heightCm: 168, weightKg: 70.2 },
      TZ,
    );
    await service.saveProgress(ana, { step: 'activity', activityLevel: 'LIGHT' }, TZ);

    const volta = await service.getProgress(ana);
    expect(volta.step).toBe('activity');
    expect(volta.onboardedAt).toBeNull();
    expect(volta.profile).toEqual({
      objective: 'LOSE',
      sex: 'FEMALE',
      birthDate: '1994-03-12',
      heightCm: 168,
      activityLevel: 'LIGHT',
      weightKg: 70.2,
    });
    // O peso fica no rascunho: pesagem só nasce ao concluir.
    expect(await prisma.weightLog.count({ where: { userId: ana } })).toBe(0);
  });

  it('a etapa das páginas da comunidade (#410) também volta ao reabrir', async () => {
    const ana = await pessoa();
    await service.saveProgress(ana, { step: 'community' }, TZ);
    expect((await service.getProgress(ana)).step).toBe('community');
  });

  it('as metas escolhidas e a origem delas também voltam', async () => {
    const ana = await pessoa();
    await service.saveProgress(ana, { step: 'goals', goals: GOALS, goalSource: 'app' }, TZ);
    const volta = await service.getProgress(ana);
    expect(volta.draft).toEqual({ goals: GOALS, goalSource: 'app' });
  });

  it('o peso do rascunho vence a última pesagem; sem rascunho, vale a pesagem', async () => {
    const ana = await pessoa();
    await prisma.weightLog.create({ data: { userId: ana, weightKg: 72, loggedAt: new Date() } });
    expect((await service.getProgress(ana)).profile.weightKg).toBe(72);
    await service.saveProgress(ana, { step: 'body', weightKg: 71.5 }, TZ);
    expect((await service.getProgress(ana)).profile.weightKg).toBe(71.5);
  });

  it('concluir grava pesagem e metas e limpa o rascunho, mas a etapa segue até o fim', async () => {
    const ana = await pessoa();
    await service.saveProgress(ana, { step: 'goals', weightKg: 70.2, goals: GOALS }, TZ);
    await service.complete(
      ana,
      {
        sex: 'FEMALE',
        birthDate: '1994-03-12',
        heightCm: 168,
        weightKg: 70.2,
        activityLevel: 'LIGHT',
        objective: 'LOSE',
        goals: GOALS,
      },
      TZ,
    );
    await service.saveProgress(ana, { step: 'reminders' }, TZ);
    const meio = await service.getProgress(ana);
    expect(meio.onboardedAt).not.toBeNull();
    expect(meio.step).toBe('reminders');
    expect(meio.draft).toEqual({});

    const fim = await service.finish(ana);
    expect(fim.firstStepsSince).not.toBeNull();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ana } });
    expect(user.onboardingStep).toBeNull();
    expect(user.onboardingDraft).toBeNull();
  });

  it('refazer o onboarding com metas novas guarda as de antes no histórico (#396)', async () => {
    const ana = await pessoa();
    await prisma.userGoals.create({
      data: { userId: ana, ...GOALS, kcalMin: 1500, kcalMax: 1600 },
    });
    await service.complete(
      ana,
      {
        sex: 'FEMALE',
        birthDate: '1994-03-12',
        heightCm: 168,
        weightKg: 70.2,
        activityLevel: 'LIGHT',
        objective: 'LOSE',
        goals: GOALS,
      },
      TZ,
    );
    const historico = await prisma.userGoalsHistory.findMany({ where: { userId: ana } });
    expect(historico).toHaveLength(1);
    expect(historico[0]).toMatchObject({ kcalMin: 1500, kcalMax: 1600, source: 'manual' });
  });

  it('terminar sem ter concluído as metas também marca o onboarding como feito', async () => {
    const ana = await pessoa();
    await service.finish(ana);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ana } });
    expect(user.onboardedAt).not.toBeNull();
    expect(user.firstStepsSince).not.toBeNull();
  });

  describe('meta sugerida pela equipe', () => {
    it('vem do plano de nutrição publicado da comunidade, com o nome de quem fez', async () => {
      const ana = await pessoa();
      const { grupo, helena } = await comunidadeCom(ana);
      await prisma.groupPlanTemplate.create({
        data: {
          groupId: grupo.id,
          authorId: helena,
          kind: 'NUTRITION',
          title: 'Cutting leve',
          snapshot: {
            version: 1,
            goals: {
              kcalMin: 1800,
              kcalMax: 1880,
              proteinMinG: 135,
              proteinMaxG: 145,
              carbsMinG: 210,
              carbsMaxG: 230,
              fatMinG: 60,
              fatMaxG: 66,
            },
            meals: [],
          },
          snapshotVersion: 1,
          publishedAt: new Date(),
        },
      });
      const { teamSuggestion } = await service.getProgress(ana);
      expect(teamSuggestion).toMatchObject({
        authorName: 'Helena Prado',
        groupName: 'Academia Demo',
        goals: { kcalMin: 1800, kcalMax: 1880, proteinMinG: 135 },
      });
    });

    it('plano não publicado ou de comunidade de que a pessoa não é membro não conta', async () => {
      const ana = await pessoa();
      const outra = await pessoa();
      const { grupo, helena } = await comunidadeCom(outra);
      await prisma.groupPlanTemplate.create({
        data: {
          groupId: grupo.id,
          authorId: helena,
          kind: 'NUTRITION',
          title: 'Plano',
          snapshot: { version: 1, goals: { ...GOALS }, meals: [] },
          snapshotVersion: 1,
          publishedAt: new Date(),
        },
      });
      expect((await service.getProgress(ana)).teamSuggestion).toBeNull();
      const { grupo: g2, helena: h2 } = await comunidadeCom(ana);
      await prisma.groupPlanTemplate.create({
        data: {
          groupId: g2.id,
          authorId: h2,
          kind: 'NUTRITION',
          title: 'Rascunho',
          snapshot: { version: 1, goals: { ...GOALS }, meals: [] },
          snapshotVersion: 1,
          publishedAt: null,
        },
      });
      expect((await service.getProgress(ana)).teamSuggestion).toBeNull();
    });
  });

  describe('primeiros passos', () => {
    it('não aparece para quem não passou pelo onboarding novo', async () => {
      const ana = await pessoa();
      expect(await service.firstSteps(ana, TZ)).toBeNull();
    });

    it('sem comunidade: refeição, treino e entrar numa comunidade, marcados pelo que aconteceu', async () => {
      const ana = await pessoa();
      await service.finish(ana);
      const antes = await service.firstSteps(ana, TZ);
      expect(antes?.items.map((i) => [i.key, i.done])).toEqual([
        ['meal', false],
        ['workout', false],
        ['community', false],
      ]);
      await prisma.meal.create({
        data: { userId: ana, mealType: 'LUNCH', eatenAt: new Date() },
      });
      const depois = await service.firstSteps(ana, TZ);
      expect(depois?.items[0]).toMatchObject({ key: 'meal', done: true });
      expect(depois?.allDone).toBe(false);
    });

    it('com comunidade: o treino da equipe e o desafio ativo, com quantas pessoas', async () => {
      const ana = await pessoa();
      const { grupo, helena } = await comunidadeCom(ana);
      const treino = await prisma.groupPlanTemplate.create({
        data: {
          groupId: grupo.id,
          authorId: helena,
          kind: 'WORKOUT',
          title: 'Hipertrofia A/B',
          snapshot: { version: 1 },
          snapshotVersion: 1,
          publishedAt: new Date(),
        },
      });
      const agora = Date.now();
      const desafio = await prisma.groupChallenge.create({
        data: {
          groupId: grupo.id,
          title: 'Semana ativa',
          metric: 'ACTIVE_DAYS',
          startsAt: new Date(agora - 86_400_000),
          endsAt: new Date(agora + 6 * 86_400_000),
          timezone: TZ,
        },
      });
      await service.finish(ana);
      const passos = await service.firstSteps(ana, TZ);
      expect(passos?.items[1]).toMatchObject({
        key: 'workout',
        title: 'Abrir o treino de Helena',
        subtitle: 'Hipertrofia A/B',
        href: `/community/${grupo.id}/content/${treino.id}`,
        done: false,
      });
      expect(passos?.items[2]).toMatchObject({
        key: 'challenge',
        title: 'Entrar no desafio',
        subtitle: 'Semana ativa · 0 pessoas',
        href: `/community/${grupo.id}/challenges/${desafio.id}`,
        done: false,
      });
    });

    it('tudo pronto: "Tudo pronto!" no mesmo dia e some no dia seguinte', async () => {
      const ana = await pessoa();
      const { grupo } = await comunidadeCom(ana);
      await service.finish(ana);
      await prisma.meal.create({ data: { userId: ana, mealType: 'LUNCH', eatenAt: new Date() } });
      await prisma.workoutSession.create({
        data: { userId: ana, startedAt: new Date(), completedAt: new Date() },
      });
      const hoje = new Date('2026-11-04T15:00:00Z');
      const pronto = await service.firstSteps(ana, TZ, hoje);
      expect(pronto?.allDone).toBe(true);
      expect(pronto?.visible).toBe(true);
      expect(grupo.id).toBeTruthy();
      // 23h59 em São Paulo ainda é o mesmo dia.
      expect((await service.firstSteps(ana, TZ, new Date('2026-11-05T02:59:00Z')))?.visible).toBe(
        true,
      );
      expect((await service.firstSteps(ana, TZ, new Date('2026-11-05T03:01:00Z')))?.visible).toBe(
        false,
      );
    });
  });
});
