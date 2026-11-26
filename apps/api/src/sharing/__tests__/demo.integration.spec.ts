import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GroupRole, GroupType, MembershipStatus } from '@fatia/db';
import { DemoSessionService } from '../../auth/demo-session.service';
import { DEMO_EMAIL_DOMAIN, DEMO_SUB_PREFIX, DEMO_TOKEN_PREFIX } from '../../common/demo';
import { PrismaService } from '../../common/prisma.service';
import { NutritionSummaryService } from '../../nutrition/nutrition-summary.service';
import { ProgressService } from '../../progress/progress.service';
import { StepLogService } from '../../progress/step-log.service';
import { WaterLogService } from '../../progress/water-log.service';
import { ExerciseService } from '../../workout/exercise.service';
import { AccessAuditService } from '../access-audit.service';
import { DemoService } from '../demo.service';
import { MemberFileService } from '../member-file.service';
import { MemberNoteService } from '../member-note.service';
import { PlanMaterializerService } from '../plan-materializer.service';
import { ProfessionalLinkService } from '../professional-link.service';
import { ProfessionalAccessService } from '../professional-access.service';

/**
 * A comunidade de demonstração (#412, Pn-21 a Pn-21d), contra Postgres real:
 * criar (idempotente, uma por dono), a Ana Exemplo já preenchida, apagar em
 * cascata sem tocar a comunidade de verdade e a sessão curta do app. Os
 * primeiros passos estão em `community-setup.integration.spec.ts` (#372).
 */
describe('comunidade de demonstração (integração, #412)', () => {
  const prisma = new PrismaService();
  const sessions = new DemoSessionService(prisma);
  const demo = new DemoService(
    prisma,
    sessions,
    new PlanMaterializerService(prisma, new ExerciseService(prisma)),
    new ProfessionalLinkService(prisma),
  );
  const file = new MemberFileService(
    prisma,
    new ProfessionalAccessService(prisma, new AccessAuditService(prisma)),
    new NutritionSummaryService(prisma),
    new ProgressService(prisma, new StepLogService(prisma), new WaterLogService(prisma)),
    new MemberNoteService(prisma),
  );

  const stamp = `t412-${Date.now()}`;
  const usuarios: string[] = [];
  const grupos: string[] = [];
  const u = { dona: '', semComunidade: '', aluna: '', outraDona: '' };
  let real = '';

  async function pessoa(nome: string) {
    const x = await prisma.user.create({
      data: {
        logtoSub: `${stamp}-${usuarios.length}`,
        email: `${stamp}-${usuarios.length}@test.local`,
        name: nome,
      },
    });
    usuarios.push(x.id);
    return x.id;
  }

  async function comunidade(dona: string, nome: string, brandColor: string | null = null) {
    const g = await prisma.group.create({
      data: {
        type: GroupType.SPONSORED,
        name: nome,
        slug: `${stamp}-${grupos.length}`,
        ownerId: dona,
        brandColor,
        memberships: {
          create: {
            userId: dona,
            role: GroupRole.OWNER,
            status: MembershipStatus.ACTIVE,
            joinedAt: new Date(),
          },
        },
      },
    });
    grupos.push(g.id);
    return g.id;
  }

  beforeAll(async () => {
    u.dona = await pessoa('Bruno Lima');
    u.semComunidade = await pessoa('Sem Comunidade');
    u.aluna = await pessoa('Carla Real');
    u.outraDona = await pessoa('Outra Dona');
    // A cor da comunidade de verdade é a primeira da demo: a demo tem de trocar.
    real = await comunidade(u.dona, 'Academia Demo', '#2563eb');
    await prisma.groupMembership.create({
      data: {
        groupId: real,
        userId: u.aluna,
        role: GroupRole.MEMBER,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
      },
    });
    await comunidade(u.outraDona, 'Outra Academia');
  });

  afterAll(async () => {
    for (const id of usuarios) await demo.remove(id);
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.$disconnect();
  });

  it('só quem é dona de uma comunidade de verdade cria a demo', async () => {
    await expect(demo.create(u.semComunidade)).rejects.toBeInstanceOf(ForbiddenException);
    // A aluna da comunidade real também não: ela não administra nada.
    await expect(demo.create(u.aluna)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await demo.get(u.semComunidade)).toEqual({
      demo: null,
      canCreate: false,
      homeGroupId: null,
    });
    const antes = await demo.get(u.dona);
    expect(antes).toEqual({ demo: null, canCreate: true, homeGroupId: real });
  });

  it('cria a Academia Exemplo com a Ana Exemplo já preenchida (Pn-21)', async () => {
    const { demo: d } = await demo.create(u.dona);
    expect(d).not.toBeNull();
    expect(d!.name).toBe('Academia Exemplo');
    // Outro nome e outra cor que a comunidade de verdade.
    expect(d!.brandColor).not.toBe('#2563eb');
    expect(d!.student.name).toBe('Ana Exemplo');
    expect(d!.plan).toEqual({
      title: 'Hipertrofia A/B',
      weekNumber: 2,
      weeks: 4,
      sessionsDone: 6,
      sessionsPlanned: 16,
    });
    expect(d!.weight?.kg).toBe(70.2);
    expect(d!.weight?.deltaKg).toBe(-2.5);
    expect(d!.today).toEqual({ kcal: 1066, kcalGoal: 1840, waterMl: 1500, waterGoalMl: 2000 });
    expect(d!.challenge?.title).toBe('Constância 30 dias');

    const g = await prisma.group.findUniqueOrThrow({ where: { id: d!.groupId } });
    expect(g).toMatchObject({
      isDemo: true,
      demoOwnerId: u.dona,
      ownerId: u.dona,
      type: GroupType.SOCIAL,
      visibility: 'PRIVATE',
      joinPolicy: 'INVITE_ONLY',
      reportEmailEnabled: false,
    });
    const ana = await prisma.user.findUniqueOrThrow({ where: { id: d!.student.userId } });
    expect(ana.demoGroupId).toBe(d!.groupId);
    expect(ana.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`)).toBe(true);
    expect(ana.logtoSub.startsWith(DEMO_SUB_PREFIX)).toBe(true);
    expect(ana.whatsappOptIn).toBe(false);
    const membros = await prisma.groupMembership.findMany({
      where: { groupId: d!.groupId },
      select: { userId: true, role: true, status: true },
    });
    expect(membros).toHaveLength(2);
    expect(membros).toEqual(
      expect.arrayContaining([
        { userId: u.dona, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
        { userId: ana.id, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
      ]),
    );
  });

  it('a ficha da Ana no painel da demo mostra o plano, o treino e o peso (Pn-21b)', async () => {
    const { demo: d } = await demo.get(u.dona);
    const ficha = await file.file(u.dona, d!.groupId, d!.student.membershipId);
    expect(ficha.name).toBe('Ana Exemplo');
    expect(ficha.grantedToMe).toEqual(expect.arrayContaining(['WORKOUT', 'NUTRITION', 'BODY']));
    expect(ficha.plans.workout[0]).toMatchObject({
      title: 'Hipertrofia A/B',
      status: 'ACTIVE',
      weekNumber: 2,
      weeks: 4,
      sessionsDone: 6,
      sessionsPlanned: 16,
    });
    expect(ficha.week.body?.currentWeightKg).toBe(70.2);
  });

  it('é idempotente: uma demo por dona, mesmo com dois cliques juntos', async () => {
    // Parte de uma dona SEM demo: os dois pedidos correm juntos desde o início.
    // Antes, o segundo achava o grupo já criado mas ainda sem a semente e
    // devolvia `plan: null`, que a web gravava no cache.
    const apressada = await pessoa('Dona Apressada');
    await comunidade(apressada, 'Academia Apressada');
    expect((await demo.get(apressada)).demo).toBeNull();

    const [a, b] = await Promise.all([demo.create(apressada), demo.create(apressada)]);
    expect(a.demo).not.toBeNull();
    expect(b.demo).not.toBeNull();
    expect(a.demo!.groupId).toBe(b.demo!.groupId);
    // Os dois recebem o estado completo, não a demo pela metade.
    expect(a.demo!.plan).not.toBeNull();
    expect(b.demo!.plan).not.toBeNull();
    expect(b.demo).toEqual(a.demo);
    expect(await prisma.group.count({ where: { demoOwnerId: apressada } })).toBe(1);
    expect(await prisma.user.count({ where: { demoGroupId: a.demo!.groupId } })).toBe(1);

    // E um terceiro clique, depois, devolve a mesma.
    expect((await demo.create(apressada)).demo!.groupId).toBe(a.demo!.groupId);
  });

  it('a sessão do app vale 30 minutos e resolve só para a Ana', async () => {
    const { demo: d } = await demo.get(u.dona);
    const agora = new Date();
    const s = await demo.openSession(u.dona);
    expect(s.token.startsWith(DEMO_TOKEN_PREFIX)).toBe(true);
    const minutos = (s.expiresAt.getTime() - agora.getTime()) / 60_000;
    expect(minutos).toBeGreaterThan(29);
    expect(minutos).toBeLessThanOrEqual(30.1);
    // O banco guarda só o hash.
    const linhas = await prisma.demoSession.findMany({ where: { groupId: d!.groupId } });
    expect(linhas).toHaveLength(1);
    expect(JSON.stringify(linhas)).not.toContain(s.token);

    const quem = await sessions.authenticate(s.token);
    expect(quem.id).toBe(d!.student.userId);
    expect(quem.id).not.toBe(u.dona);
    await expect(
      sessions.authenticate(s.token, new Date(agora.getTime() + 31 * 60_000)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(sessions.authenticate(`${DEMO_TOKEN_PREFIX}inventado`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // Quem não tem demo não abre sessão.
    await expect(demo.openSession(u.outraDona)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('apagar leva a Ana e tudo dela, e não mexe na comunidade de verdade (Pn-21c)', async () => {
    const { demo: d } = await demo.get(u.dona);
    const ana = d!.student.userId;
    const s = await demo.openSession(u.dona);
    const antesReal = await prisma.groupMembership.count({ where: { groupId: real } });

    expect(await demo.remove(u.dona)).toEqual({ removed: true });

    expect(await prisma.group.findUnique({ where: { id: d!.groupId } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: ana } })).toBeNull();
    const restos = await Promise.all([
      prisma.meal.count({ where: { userId: ana } }),
      prisma.weightLog.count({ where: { userId: ana } }),
      prisma.waterLog.count({ where: { userId: ana } }),
      prisma.workoutSession.count({ where: { userId: ana } }),
      prisma.workoutPlan.count({ where: { userId: ana } }),
      prisma.plannedSession.count({ where: { userId: ana } }),
      prisma.planOffer.count({ where: { userId: ana } }),
      prisma.professionalLink.count({ where: { subjectUserId: ana } }),
      prisma.groupChallenge.count({ where: { groupId: d!.groupId } }),
      prisma.demoSession.count({ where: { groupId: d!.groupId } }),
    ]);
    expect(restos).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    await expect(sessions.authenticate(s.token)).rejects.toBeInstanceOf(UnauthorizedException);

    expect(await prisma.group.findUnique({ where: { id: real } })).not.toBeNull();
    expect(await prisma.groupMembership.count({ where: { groupId: real } })).toBe(antesReal);
    expect(await prisma.user.findUnique({ where: { id: u.dona } })).not.toBeNull();

    expect((await demo.get(u.dona)).demo).toBeNull();
    // Apagar de novo não é erro: a tela pode ter ficado aberta em duas abas.
    expect(await demo.remove(u.dona)).toEqual({ removed: false });
  });

  it('dá para criar de novo depois de apagar', async () => {
    const { demo: d } = await demo.create(u.dona);
    expect(d!.name).toBe('Academia Exemplo');
    expect(await prisma.group.count({ where: { demoOwnerId: u.dona } })).toBe(1);
  });
});
