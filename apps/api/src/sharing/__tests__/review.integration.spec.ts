import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import type { NotificationService } from '../../notifications/notification.service';
import { todayInTz } from '../../progress/helpers/date-tz';
import { AccountService } from '../../users/account.service';
import type { CheckpointPurgeService } from '../../chat/checkpoint-purge.service';
import type { LogtoManagementService } from '../../auth/logto-management.service';
import { WorkoutSessionService } from '../../workout/workout-session.service';
import { AccessAuditService } from '../access-audit.service';
import { MembershipService } from '../membership.service';
import { ProfessionalAccessService } from '../professional-access.service';
import { ProfessionalLinkService } from '../professional-link.service';
import { ReviewService } from '../review.service';

const DIA = 86_400_000;
const atras = (dias: number) => new Date(Date.now() - dias * DIA);

/**
 * "Para revisar", "Em risco" e a sessão feita (#399), no Postgres real.
 *
 * O roteiro é o critério de pronto da issue: a Helena abre "Para revisar", vê a
 * sessão da Ana (que compartilha Treino), comenta, e a sessão sai da fila dela;
 * a Ana recebe o comentário. Para quem não compartilha Treino, a sessão não
 * entra na fila e, aberta pelo endereço, só diz que não há detalhe.
 */
describe('para revisar, em risco e sessão feita (integração, #399)', () => {
  const prisma = new PrismaService();
  const notify = jest.fn();
  const notifications = { notify } as unknown as NotificationService;
  const access = new ProfessionalAccessService(prisma, new AccessAuditService(prisma));
  const sessions = new WorkoutSessionService(prisma);
  const review = new ReviewService(prisma, access, sessions, notifications);
  const memberships = new MembershipService(
    prisma,
    new ProfessionalLinkService(prisma),
    notifications,
  );
  const account = new AccountService(
    prisma,
    {} as LogtoManagementService,
    {} as CheckpointPurgeService,
  );
  const TZ = 'America/Sao_Paulo';

  const stamp = `revisar-${Date.now()}`;
  const criados: string[] = [];
  let n = 0;
  const g = { id: '', outro: '' };
  const ids = {
    ana: '',
    carla: '',
    diego: '',
    eva: '',
    gil: '',
    ivo: '',
    nova: '',
    helena: '',
    bruno: '',
    deFora: '',
    anaM: '',
    carlaM: '',
  };
  const s = { anaHoje: '', anaVelha: '', anaAberta: '', carla: '', diego: '', deFora: '' };
  const outros = { metaAna: '', versaoCarla: '' };

  async function pessoa(nome: string, extra: Record<string, unknown> = {}) {
    n += 1;
    const user = await prisma.user.create({
      data: {
        logtoSub: `${stamp}-${n}`,
        email: `${stamp}-${n}@test.local`,
        name: nome,
        timezone: TZ,
        ...extra,
      },
    });
    criados.push(user.id);
    return user.id;
  }

  const membershipOf = async (groupId: string, userId: string) =>
    (
      await prisma.groupMembership.findUniqueOrThrow({
        where: { groupId_userId: { groupId, userId } },
      })
    ).id;

  async function treino(userId: string, diasAtras: number, done = true) {
    const fim = atras(diasAtras);
    const s = await prisma.workoutSession.create({
      data: {
        userId,
        planName: 'Inferior v2',
        fromPlan: true,
        startedAt: new Date(fim.getTime() - 52 * 60_000),
        completedAt: done ? fim : null,
      },
    });
    return s.id;
  }

  const logs = (subjectUserId: string, action: string) =>
    prisma.professionalAccessLog.findMany({
      where: { professionalId: ids.helena, subjectUserId, action },
    });

  beforeAll(async () => {
    await prisma.$connect();
    ids.ana = await pessoa('Ana Dias', { whatsapp: '5565998123456', whatsappOptIn: true });
    ids.carla = await pessoa('Carla Souza', { whatsapp: '5565911112222', whatsappOptIn: false });
    ids.diego = await pessoa('Diego Lima');
    ids.eva = await pessoa('Eva Rocha');
    ids.gil = await pessoa('Gil Matos');
    ids.ivo = await pessoa('Ivo Prado');
    ids.nova = await pessoa('Nova Reis');
    ids.helena = await pessoa('Helena Prado');
    ids.bruno = await pessoa('Bruno Lima');
    ids.deFora = await pessoa('Dona de fora');

    g.id = (
      await prisma.group.create({
        data: { type: 'SPONSORED', name: 'Academia Demo', slug: `${stamp}-g`, ownerId: ids.bruno },
      })
    ).id;
    g.outro = (
      await prisma.group.create({
        data: { type: 'SPONSORED', name: 'Outra', slug: `${stamp}-o`, ownerId: ids.deFora },
      })
    ).id;
    const entrou = atras(60);
    await prisma.groupMembership.createMany({
      data: [
        { groupId: g.id, userId: ids.bruno, role: 'OWNER', status: 'ACTIVE' },
        { groupId: g.id, userId: ids.helena, role: 'PROFESSIONAL', status: 'ACTIVE' },
        ...[ids.ana, ids.carla, ids.diego, ids.eva, ids.gil, ids.ivo].map((userId) => ({
          groupId: g.id,
          userId,
          role: 'MEMBER' as const,
          status: 'ACTIVE' as const,
          joinedAt: entrou,
        })),
        // Entrou há 10 dias e nunca registrou nada.
        {
          groupId: g.id,
          userId: ids.nova,
          role: 'MEMBER',
          status: 'ACTIVE',
          joinedAt: atras(10),
        },
        { groupId: g.outro, userId: ids.deFora, role: 'OWNER', status: 'ACTIVE' },
        { groupId: g.outro, userId: ids.carla, role: 'MEMBER', status: 'ACTIVE' },
      ],
    });
    ids.anaM = await membershipOf(g.id, ids.ana);
    ids.carlaM = await membershipOf(g.id, ids.carla);
    await prisma.professionalLink.createMany({
      data: [
        {
          subjectUserId: ids.ana,
          professionalId: ids.helena,
          groupId: g.id,
          scopes: ['WORKOUT', 'GOALS', 'NUTRITION'],
        },
        // A Carla só mostra Alimentação: o treino dela não entra na fila.
        {
          subjectUserId: ids.carla,
          professionalId: ids.helena,
          groupId: g.id,
          scopes: ['NUTRITION'],
        },
        // O Diego revogou: nada dele entra.
        {
          subjectUserId: ids.diego,
          professionalId: ids.helena,
          groupId: g.id,
          scopes: ['WORKOUT'],
          revokedAt: atras(1),
          revokedReason: 'subject',
        },
        { subjectUserId: ids.eva, professionalId: ids.helena, groupId: g.id, scopes: ['WORKOUT'] },
        { subjectUserId: ids.gil, professionalId: ids.helena, groupId: g.id, scopes: ['WORKOUT'] },
        // O Ivo só mostra fotos das refeições: não dá para dizer que sumiu.
        {
          subjectUserId: ids.ivo,
          professionalId: ids.helena,
          groupId: g.id,
          scopes: ['MEAL_PHOTOS'],
        },
        { subjectUserId: ids.nova, professionalId: ids.helena, groupId: g.id, scopes: ['WORKOUT'] },
        // A Carla na outra comunidade compartilha Treino com a dona de lá.
        {
          subjectUserId: ids.carla,
          professionalId: ids.deFora,
          groupId: g.outro,
          scopes: ['WORKOUT'],
        },
      ],
    });

    s.anaHoje = await treino(ids.ana, 0.1);
    s.anaVelha = await treino(ids.ana, 9);
    s.anaAberta = await treino(ids.ana, 0.05, false);
    s.carla = await treino(ids.carla, 1);
    s.diego = await treino(ids.diego, 1);
    await treino(ids.diego, 30);
    // Último registro da Eva há 20 dias: "sumiu" com o limite de 7.
    await treino(ids.eva, 20);
    await treino(ids.gil, 2);
    await prisma.meal.create({
      data: { userId: ids.carla, mealType: 'LUNCH', eatenAt: atras(9) },
    });

    const ex = await prisma.exercise.findFirst({
      where: { createdByUserId: null, groupOwned: false, muscleGroup: { not: 'cardio' } },
      select: { id: true },
    });
    if (!ex) throw new Error('rode seed:exercises no banco de teste');
    await prisma.sessionSet.createMany({
      data: [1, 2, 3].map((setNumber) => ({
        sessionId: s.anaHoje,
        exerciseId: ex.id,
        setNumber,
        weightKg: 60,
        reps: 8,
      })),
    });
    await prisma.workoutCheckin.create({
      data: { sessionId: s.anaHoje, userId: ids.ana, fatigue: 3, pain: false, note: 'Queimou' },
    });

    outros.metaAna = (
      await prisma.goal.create({
        data: {
          userId: ids.ana,
          kind: 'workout_frequency',
          title: 'Treinar 4× por semana',
          startValue: 0,
          targetValue: 4,
          unit: 'treinos',
          status: 'completed',
          completedAt: atras(2),
        },
      })
    ).id;
    const oferta = await prisma.planOffer.create({
      data: {
        userId: ids.carla,
        authorId: ids.helena,
        groupId: g.id,
        versions: {
          create: {
            version: 1,
            status: 'DECLINED',
            title: 'Cutting 1.800',
            snapshot: {},
            snapshotVersion: 1,
            schedule: 'FLEXIBLE',
            respondedAt: atras(1),
          },
        },
      },
      include: { versions: true },
    });
    outros.versaoCarla = oferta.versions[0]!.id;

    const deFora = await prisma.user.create({
      data: {
        logtoSub: `${stamp}-fora`,
        email: `${stamp}-fora@test.local`,
        name: 'Sem comunidade',
        timezone: TZ,
      },
    });
    criados.push(deFora.id);
    s.deFora = await treino(deFora.id, 1);
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: [g.id, g.outro] } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  beforeEach(() => notify.mockClear());

  describe('a fila "Para revisar"', () => {
    it('membro comum não abre a fila', async () => {
      await expect(review.queue(ids.ana, g.id)).rejects.toThrow(ForbiddenException);
      await expect(review.queue(ids.helena, g.outro)).rejects.toThrow(NotFoundException);
    });

    it('traz o treino concluído e a meta de quem compartilha, e as respostas aos planos', async () => {
      const { items } = await review.queue(ids.helena, g.id);
      const refs = items.map((i) => i.refId);
      expect(refs).toContain(s.anaHoje);
      expect(refs).toContain(outros.metaAna);
      expect(refs).toContain(outros.versaoCarla);
      // Treino velho (fora dos 7 dias), aberto, de quem não compartilha Treino e de quem revogou.
      for (const fora of [s.anaVelha, s.anaAberta, s.carla, s.diego, s.deFora]) {
        expect(refs).not.toContain(fora);
      }
      const daAna = items.find((i) => i.refId === s.anaHoje)!;
      expect(daAna).toMatchObject({
        kind: 'WORKOUT',
        membershipId: ids.anaM,
        name: 'Ana Dias',
        title: 'Inferior v2',
        durationMinutes: 52,
        sets: 3,
        whatsapp: '5565998123456',
        seenAt: null,
        myFeedback: false,
      });
      expect([...daAna.shares].sort()).toEqual(['GOALS', 'NUTRITION', 'WORKOUT']);
      const daCarla = items.find((i) => i.refId === outros.versaoCarla)!;
      expect(daCarla).toMatchObject({
        kind: 'PLAN_RESPONSE',
        membershipId: ids.carlaM,
        title: 'Cutting 1.800',
        answer: 'DECLINED',
        shares: ['NUTRITION'],
        // A Carla não deixou a equipe ver o WhatsApp.
        whatsapp: null,
      });
    });

    it('cada categoria lida entra na trilha da pessoa, e quem não compartilha não vira tentativa', async () => {
      await review.queue(ids.helena, g.id);
      const daAna = await logs(ids.ana, 'list_review_queue');
      expect(daAna.map((l) => l.scope).sort()).toEqual(
        expect.arrayContaining(['GOALS', 'WORKOUT']),
      );
      expect(daAna.every((l) => !l.denied && l.groupId === g.id)).toBe(true);
      // A Carla não compartilha Treino nem Metas: nada foi tentado em nome dela.
      expect(await logs(ids.carla, 'list_review_queue')).toEqual([]);
    });

    it('o dono sem vínculo vê só as respostas aos planos, nunca o treino', async () => {
      const { items } = await review.queue(ids.bruno, g.id);
      expect(items.map((i) => i.kind)).toEqual(['PLAN_RESPONSE']);
      expect(items[0]!.shares).toEqual([]);
    });

    it('"Visto" marca só para quem viu', async () => {
      const { seenAt } = await review.markSeen(ids.helena, g.id, 'WORKOUT', s.anaHoje);
      expect(seenAt).toBeInstanceOf(Date);
      // De novo: idempotente.
      await review.markSeen(ids.helena, g.id, 'WORKOUT', s.anaHoje);
      const item = (await review.queue(ids.helena, g.id)).items.find((i) => i.refId === s.anaHoje)!;
      expect(item.seenAt).not.toBeNull();
      expect(await prisma.reviewSeen.count({ where: { refId: s.anaHoje } })).toBe(1);
      await review.markSeen(ids.bruno, g.id, 'PLAN_RESPONSE', outros.versaoCarla);
      const daHelena = (await review.queue(ids.helena, g.id)).items.find(
        (i) => i.refId === outros.versaoCarla,
      )!;
      expect(daHelena.seenAt).toBeNull();
    });

    it('"Visto" não marca item que quem pede não vê nem de outra comunidade', async () => {
      // Treino da Carla: ela não compartilha Treino com a Helena.
      await expect(review.markSeen(ids.helena, g.id, 'WORKOUT', s.carla)).rejects.toThrow(
        NotFoundException,
      );
      // Treino de quem não é desta comunidade, e id que não existe.
      await expect(review.markSeen(ids.helena, g.id, 'WORKOUT', s.deFora)).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        review.markSeen(ids.helena, g.id, 'GOAL', '00000000-0000-4000-8000-000000000000'),
      ).rejects.toThrow(NotFoundException);
      // A resposta ao plano da G não se marca pela outra comunidade.
      await expect(
        review.markSeen(ids.deFora, g.outro, 'PLAN_RESPONSE', outros.versaoCarla),
      ).rejects.toThrow(NotFoundException);
      expect(await prisma.reviewSeen.count({ where: { refId: s.carla } })).toBe(0);
    });
  });

  describe('a sessão feita (Pn-35)', () => {
    it('quem compartilha Treino mostra o detalhe, e a abertura entra na trilha', async () => {
      const view = await review.session(ids.helena, g.id, s.anaHoje);
      if (!view.shared) throw new Error('esperava o detalhe');
      expect(view.name).toBe('Ana Dias');
      expect(view.membershipId).toBe(ids.anaM);
      expect(view.summary.sets).toBe(3);
      expect(view.summary.durationMinutes).toBe(52);
      expect(view.checkin).toMatchObject({ fatigue: 3, pain: false, note: 'Queimou' });
      expect(view.whatsapp).toBe('5565998123456');
      expect((await logs(ids.ana, 'get_review_session')).length).toBeGreaterThan(0);
    });

    it('sem Treino liberado, só diz que não há detalhe (Pn-35b) e a tentativa fica na trilha', async () => {
      const view = await review.session(ids.helena, g.id, s.carla);
      expect(view).toEqual({ shared: false, name: 'Carla Souza' });
      const tentativas = await logs(ids.carla, 'get_review_session');
      expect(tentativas.some((l) => l.denied)).toBe(true);
      // O dono sem vínculo também não vê.
      expect((await review.session(ids.bruno, g.id, s.anaHoje)).shared).toBe(false);
    });

    it('sessão de quem não é desta comunidade, aberta ou inexistente responde como inexistente', async () => {
      await expect(review.session(ids.helena, g.id, s.deFora)).rejects.toThrow(NotFoundException);
      await expect(review.session(ids.helena, g.id, s.anaAberta)).rejects.toThrow(
        NotFoundException,
      );
      // A Carla é da outra comunidade também: a dona de lá não abre o treino pela G.
      await expect(review.session(ids.deFora, g.id, s.carla)).rejects.toThrow(NotFoundException);
      await expect(review.session(ids.ana, g.id, s.anaHoje)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('reação e comentário', () => {
    it('a Helena comenta, a sessão sai da fila dela e a Ana recebe o aviso sem o texto', async () => {
      const fb = await review.sendFeedback(ids.helena, g.id, s.anaHoje, {
        reaction: 'STRONG',
        body: 'Recorde no agachamento!',
      });
      expect(fb).toMatchObject({ reaction: 'STRONG', body: 'Recorde no agachamento!' });
      const item = (await review.queue(ids.helena, g.id)).items.find((i) => i.refId === s.anaHoje)!;
      expect(item.myFeedback).toBe(true);
      expect(item.seenAt).not.toBeNull();
      expect(notify).toHaveBeenCalledTimes(1);
      const [quem, aviso] = notify.mock.calls[0] as [
        string[],
        { title: string; body: string; url: string },
      ];
      expect(quem).toEqual([ids.ana]);
      expect(aviso.title).toBe('Helena comentou seu treino');
      expect(aviso.url).toBe(`/workout/history/${s.anaHoje}`);
      expect(JSON.stringify(aviso)).not.toContain('Recorde');
    });

    it('mandar de novo substitui (um por pessoa da equipe), e só reação não avisa de novo', async () => {
      await review.sendFeedback(ids.helena, g.id, s.anaHoje, { reaction: 'FIRE' });
      const linhas = await prisma.sessionFeedback.findMany({ where: { sessionId: s.anaHoje } });
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toMatchObject({ reaction: 'FIRE', body: 'Recorde no agachamento!' });
      expect(notify).not.toHaveBeenCalled();
      const view = await review.session(ids.helena, g.id, s.anaHoje);
      if (!view.shared) throw new Error('esperava o detalhe');
      expect(view.feedback).toMatchObject([
        { authorName: 'Helena Prado', reaction: 'FIRE', isMine: true },
      ]);
    });

    it('vazio, longo demais ou sem Treino liberado não grava', async () => {
      await expect(review.sendFeedback(ids.helena, g.id, s.anaHoje, {})).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        review.sendFeedback(ids.helena, g.id, s.anaHoje, { body: 'x'.repeat(501) }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        review.sendFeedback(ids.helena, g.id, s.carla, { reaction: 'CLAP' }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        review.sendFeedback(ids.bruno, g.id, s.anaHoje, { reaction: 'CLAP' }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        review.sendFeedback(ids.helena, g.id, s.deFora, { reaction: 'CLAP' }),
      ).rejects.toThrow(NotFoundException);
      expect(await prisma.sessionFeedback.count({ where: { sessionId: s.carla } })).toBe(0);
    });

    it('a Ana vê o comentário no detalhe do treino e na sessão (MCP)', async () => {
      const resumo = await sessions.summary(ids.ana, s.anaHoje);
      expect(resumo.feedback).toMatchObject([
        {
          authorName: 'Helena Prado',
          groupName: 'Academia Demo',
          reaction: 'FIRE',
          body: 'Recorde no agachamento!',
        },
      ]);
      const sessao = await sessions.findById(ids.ana, s.anaHoje);
      expect(sessao.feedback).toHaveLength(1);
      // A sessão da Ana não traz o comentário para mais ninguém.
      await expect(sessions.summary(ids.carla, s.anaHoje)).rejects.toThrow(NotFoundException);
    });
  });

  describe('"Em risco"', () => {
    it('lista pelo nome só quem tem vínculo ativo com quem olha, com o último registro', async () => {
      const r = await review.atRisk(ids.helena, g.id);
      expect(r.riskDays).toBe(7);
      const porNome = Object.fromEntries(r.rows.map((x) => [x.name, x]));
      expect(Object.keys(porNome).sort()).toEqual(['Carla Souza', 'Eva Rocha', 'Nova Reis']);
      expect(porNome['Eva Rocha']).toMatchObject({ level: 'gone', days: 20, signal: 'inactive' });
      expect(porNome['Carla Souza']).toMatchObject({
        level: 'attention',
        days: 9,
        shares: ['NUTRITION'],
      });
      // Nunca registrou: conta desde a entrada.
      expect(porNome['Nova Reis']).toMatchObject({ days: 10, lastAt: null, signal: 'never' });
      // A Ana treinou hoje (e o treino velho não conta), o Gil há 2 dias; o Diego
      // revogou e o Ivo só mostra fotos: nenhum deles aparece.
      expect(r.canConfigure).toBe(false);
      expect(r.digest).toBe(false);
    });

    it('cada categoria lida entra na trilha; o dono sem vínculo não vê ninguém', async () => {
      await review.atRisk(ids.helena, g.id);
      const daEva = await logs(ids.eva, 'list_at_risk');
      expect(daEva.length).toBeGreaterThan(0);
      expect(daEva.every((l) => l.scope === 'WORKOUT' && !l.denied)).toBe(true);
      expect(await logs(ids.diego, 'list_at_risk')).toEqual([]);
      const doDono = await review.atRisk(ids.bruno, g.id);
      expect(doDono.rows).toEqual([]);
      expect(doDono.canConfigure).toBe(true);
    });

    it('sem treinar há dias, mas registrando outra coisa, é "sem treino"', async () => {
      await prisma.meal.create({
        data: { userId: ids.eva, mealType: 'LUNCH', eatenAt: atras(1) },
      });
      await prisma.professionalLink.updateMany({
        where: { subjectUserId: ids.eva, professionalId: ids.helena },
        data: { scopes: ['WORKOUT', 'NUTRITION'] },
      });
      const eva = (await review.atRisk(ids.helena, g.id)).rows.find((x) => x.name === 'Eva Rocha')!;
      expect(eva).toMatchObject({ signal: 'no_workout', days: 20, level: 'gone' });
    });

    it('o limite é do dono, entre 3 e 60 dias', async () => {
      await expect(review.setRiskDays(ids.helena, g.id, 14)).rejects.toThrow(ForbiddenException);
      await expect(review.setRiskDays(ids.bruno, g.id, 2)).rejects.toThrow(BadRequestException);
      await review.setRiskDays(ids.bruno, g.id, 14);
      const r = await review.atRisk(ids.helena, g.id);
      expect(r.rows.map((x) => x.name).sort()).toEqual(['Eva Rocha']);
      await review.setRiskDays(ids.bruno, g.id, 7);
    });
  });

  describe('aviso diário à equipe', () => {
    it('é opcional, sai uma vez por dia e só com o número, sem nomes', async () => {
      const meioDia = new Date(`${todayInTz(TZ)}T15:00:00Z`);
      await review.sendRiskDigests(meioDia);
      expect(notify).not.toHaveBeenCalled();

      await review.setDigest(ids.helena, g.id, true);
      expect((await review.atRisk(ids.helena, g.id)).digest).toBe(true);
      await review.sendRiskDigests(meioDia);
      expect(notify).toHaveBeenCalledTimes(1);
      const [quem, aviso] = notify.mock.calls[0] as [string[], { title: string; body: string }];
      expect(quem).toEqual([ids.helena]);
      expect(aviso.body).toBe('3 alunos precisam de atenção.');
      for (const nome of ['Eva', 'Carla', 'Nova'])
        expect(JSON.stringify(aviso)).not.toContain(nome);

      notify.mockClear();
      await review.sendRiskDigests(meioDia);
      expect(notify).not.toHaveBeenCalled();
    });

    it('antes das 9h da comunidade não sai', async () => {
      await prisma.groupMembership.updateMany({
        where: { groupId: g.id, userId: ids.helena },
        data: { riskDigestOn: null },
      });
      await review.sendRiskDigests(new Date(`${todayInTz(TZ)}T10:00:00Z`));
      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe('LGPD', () => {
    it('o comentário recebido entra no export da Ana', async () => {
      const dump = await account.exportData(ids.ana);
      expect(dump.sessionFeedback).toMatchObject([
        { sessionId: s.anaHoje, authorName: 'Helena Prado', groupName: 'Academia Demo' },
      ]);
      const daHelena = await account.exportData(ids.helena);
      expect(daHelena.reviewSeen.length).toBeGreaterThan(0);
      expect(daHelena.sessionFeedbackWritten).toMatchObject([{ sessionId: s.anaHoje }]);
    });

    it('sair da comunidade apaga o comentário recebido e o "visto" sobre ela', async () => {
      await memberships.leave(ids.ana, g.id);
      expect(await prisma.sessionFeedback.count({ where: { sessionId: s.anaHoje } })).toBe(0);
      expect(await prisma.reviewSeen.count({ where: { subjectUserId: ids.ana } })).toBe(0);
      // E a sessão dela não abre mais pelo painel.
      await expect(review.session(ids.helena, g.id, s.anaHoje)).rejects.toThrow(NotFoundException);
    });
  });
});
