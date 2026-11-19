import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { GoalsService } from '../../goals/goals.service';
import type { NotificationService } from '../../notifications/notification.service';
import type { StepLogService } from '../../progress/step-log.service';
import type { WeightLogService } from '../../progress/weight-log.service';
import { todayInTz } from '../../progress/helpers/date-tz';
import { WorkoutSessionService } from '../../workout/workout-session.service';
import { AccessAuditService } from '../access-audit.service';
import { ProfessionalAccessService } from '../professional-access.service';
import { ReviewService, riskDigestNotice } from '../review.service';

const DIA = 86_400_000;
const atras = (dias: number) => new Date(Date.now() - dias * DIA);

/**
 * As correções da revisão adversarial da #399, no Postgres real.
 *
 * A Paula é profissional em duas comunidades (A e B) e o Sérgio é aluno das
 * duas, compartilhando Treino com ela nas duas. O comentário de uma comunidade
 * nunca vira o da outra (F1), envios simultâneos não quebram nem avisam duas
 * vezes (F2), editar o texto não avisa de novo (F3), apagar a sessão ou a meta
 * leva o "Visto" junto (F5) e o limite conta caracteres como o banco (F8).
 *
 * As comunidades ficam em Kiritimati (UTC+14): o aviso diário das outras
 * suítes, que roda às 15h UTC, cai antes das 9h daqui e não toca nestas.
 */
describe('para revisar: correções da revisão (integração, #399)', () => {
  const prisma = new PrismaService();
  const notify = jest.fn();
  const notifications = { notify } as unknown as NotificationService;
  const access = new ProfessionalAccessService(prisma, new AccessAuditService(prisma));
  const sessions = new WorkoutSessionService(prisma);
  const review = new ReviewService(prisma, access, sessions, notifications);
  const goals = new GoalsService(prisma, {} as WeightLogService, {} as StepLogService);
  const TZ = 'Pacific/Kiritimati';

  const stamp = `revisar-fix-${Date.now()}`;
  const criados: string[] = [];
  let n = 0;
  const g = { a: '', b: '' };
  const ids = { paula: '', sergio: '', semData: '', donoA: '', donoB: '' };

  async function pessoa(nome: string) {
    n += 1;
    const user = await prisma.user.create({
      data: {
        logtoSub: `${stamp}-${n}`,
        email: `${stamp}-${n}@test.local`,
        name: nome,
        timezone: TZ,
      },
    });
    criados.push(user.id);
    return user.id;
  }

  async function treino(userId: string, diasAtras: number) {
    const fim = atras(diasAtras);
    return (
      await prisma.workoutSession.create({
        data: {
          userId,
          planName: 'Superior',
          fromPlan: true,
          startedAt: new Date(fim.getTime() - 40 * 60_000),
          completedAt: fim,
        },
      })
    ).id;
  }

  beforeAll(async () => {
    await prisma.$connect();
    ids.paula = await pessoa('Paula Reis');
    ids.sergio = await pessoa('Sérgio Alves');
    ids.semData = await pessoa('Sem Data');
    ids.donoA = await pessoa('Dono A');
    ids.donoB = await pessoa('Dono B');
    for (const [k, dono] of [
      ['a', ids.donoA],
      ['b', ids.donoB],
    ] as const) {
      g[k] = (
        await prisma.group.create({
          data: {
            type: 'SPONSORED',
            name: `Comunidade ${k.toUpperCase()}`,
            slug: `${stamp}-${k}`,
            ownerId: dono,
            timezone: TZ,
          },
        })
      ).id;
      await prisma.groupMembership.createMany({
        data: [
          { groupId: g[k], userId: dono, role: 'OWNER', status: 'ACTIVE' },
          { groupId: g[k], userId: ids.paula, role: 'PROFESSIONAL', status: 'ACTIVE' },
          {
            groupId: g[k],
            userId: ids.sergio,
            role: 'MEMBER',
            status: 'ACTIVE',
            joinedAt: atras(40),
          },
        ],
      });
      await prisma.professionalLink.create({
        data: {
          subjectUserId: ids.sergio,
          professionalId: ids.paula,
          groupId: g[k],
          scopes: ['WORKOUT', 'GOALS'],
        },
      });
    }
    // Membro ativo sem `joinedAt` (entrou antes de a coluna existir): entrou há 10 dias.
    for (const groupId of [g.a, g.b]) {
      await prisma.groupMembership.create({
        data: {
          groupId,
          userId: ids.semData,
          role: 'MEMBER',
          status: 'ACTIVE',
          joinedAt: null,
          createdAt: atras(10),
        },
      });
      await prisma.professionalLink.create({
        data: {
          subjectUserId: ids.semData,
          professionalId: ids.paula,
          groupId,
          scopes: ['WORKOUT'],
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: [g.a, g.b] } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  beforeEach(() => notify.mockClear());

  describe('F1: um comentário por comunidade', () => {
    it('comentar em A e reagir em B deixa dois comentários, cada um na sua comunidade', async () => {
      const sessao = await treino(ids.sergio, 0.2);
      await review.sendFeedback(ids.paula, g.a, sessao, { body: 'Ótimo ritmo' });

      const filaB = await review.queue(ids.paula, g.b);
      expect(filaB.items.find((i) => i.refId === sessao)?.myFeedback).toBe(false);

      await review.sendFeedback(ids.paula, g.b, sessao, { reaction: 'FIRE' });
      const linhas = await prisma.sessionFeedback.findMany({
        where: { sessionId: sessao },
        orderBy: { createdAt: 'asc' },
      });
      expect(linhas).toHaveLength(2);
      expect(linhas[0]).toMatchObject({ groupId: g.a, body: 'Ótimo ritmo', reaction: null });
      expect(linhas[1]).toMatchObject({ groupId: g.b, body: null, reaction: 'FIRE' });

      const emA = await review.session(ids.paula, g.a, sessao);
      const emB = await review.session(ids.paula, g.b, sessao);
      if (!emA.shared || !emB.shared) throw new Error('esperava o detalhe');
      expect(emA.feedback).toMatchObject([{ body: 'Ótimo ritmo', reaction: null }]);
      expect(emB.feedback).toMatchObject([{ body: null, reaction: 'FIRE' }]);

      // O aluno vê os dois, cada um com a sua comunidade.
      const resumo = await sessions.summary(ids.sergio, sessao);
      expect(resumo.feedback.map((f) => f.groupName).sort()).toEqual([
        'Comunidade A',
        'Comunidade B',
      ]);
    });
  });

  describe('F2 e F3: o aviso ao aluno', () => {
    it('quatro envios simultâneos do primeiro comentário: nenhum erro e um aviso', async () => {
      const sessao = await treino(ids.sergio, 0.3);
      const envios = await Promise.allSettled(
        [1, 2, 3, 4].map((i) => review.sendFeedback(ids.paula, g.a, sessao, { body: `Boa ${i}` })),
      );
      expect(envios.filter((e) => e.status === 'rejected')).toEqual([]);
      expect(await prisma.sessionFeedback.count({ where: { sessionId: sessao } })).toBe(1);
      expect(notify).toHaveBeenCalledTimes(1);
    });

    it('avisa ao reagir e ao escrever pela primeira vez; editar o texto não avisa', async () => {
      const sessao = await treino(ids.sergio, 0.4);
      await review.sendFeedback(ids.paula, g.a, sessao, { reaction: 'CLAP' });
      expect(notify).toHaveBeenCalledTimes(1);
      expect((notify.mock.calls[0] as [string[], { title: string }])[1].title).toBe(
        'Paula reagiu ao seu treino',
      );

      notify.mockClear();
      await review.sendFeedback(ids.paula, g.a, sessao, { body: 'Mandou bem' });
      expect(notify).toHaveBeenCalledTimes(1);
      expect((notify.mock.calls[0] as [string[], { title: string }])[1].title).toBe(
        'Paula comentou seu treino',
      );

      notify.mockClear();
      await review.sendFeedback(ids.paula, g.a, sessao, { body: 'Mandou muito bem' });
      await review.sendFeedback(ids.paula, g.a, sessao, { body: 'Mandou muito bem!' });
      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe('F5: o "Visto" vai embora com o item', () => {
    it('apagar a sessão apaga o "Visto" dela', async () => {
      const sessao = await treino(ids.sergio, 0.5);
      await review.markSeen(ids.paula, g.a, 'WORKOUT', sessao);
      expect(await prisma.reviewSeen.count({ where: { refId: sessao } })).toBe(1);
      await sessions.delete(ids.sergio, sessao);
      expect(await prisma.reviewSeen.count({ where: { refId: sessao } })).toBe(0);
    });

    it('apagar a meta apaga o "Visto" dela', async () => {
      const meta = await prisma.goal.create({
        data: {
          userId: ids.sergio,
          kind: 'workout_frequency',
          title: 'Treinar 3× por semana',
          startValue: 0,
          targetValue: 3,
          unit: 'treinos',
          status: 'completed',
          completedAt: atras(1),
        },
      });
      await review.markSeen(ids.paula, g.a, 'GOAL', meta.id);
      expect(await prisma.reviewSeen.count({ where: { refId: meta.id } })).toBe(1);
      await goals.delete(meta.id, ids.sergio);
      expect(await prisma.reviewSeen.count({ where: { refId: meta.id } })).toBe(0);
    });
  });

  describe('F8: o limite conta caracteres como o banco', () => {
    it('500 emojis cabem; 501 não', async () => {
      const sessao = await treino(ids.sergio, 0.6);
      const fb = await review.sendFeedback(ids.paula, g.a, sessao, { body: '💪'.repeat(500) });
      expect([...(fb.body ?? '')].length).toBe(500);
      await expect(
        review.sendFeedback(ids.paula, g.a, sessao, { body: '💪'.repeat(501) }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('em risco e aviso diário', () => {
    it('membro sem data de entrada conta da criação da associação ("não começou")', async () => {
      const r = await review.atRisk(ids.paula, g.a);
      expect(r.rows.find((x) => x.name === 'Sem Data')).toMatchObject({
        signal: 'never',
        days: 10,
        lastAt: null,
      });
    });

    it('o toque no aviso leva a um caminho sem "?"', () => {
      expect(riskDigestNotice('g1', 'Academia', 2).url).toBe('/org/g1/review/at-risk');
    });

    it('a falha de uma pessoa não para o aviso das outras', async () => {
      await prisma.groupMembership.updateMany({
        where: { userId: ids.paula, groupId: { in: [g.a, g.b] } },
        data: { riskDigest: true, riskDigestOn: null },
      });
      // Só as associações desta suíte: o banco é dividido com as outras.
      const findMany = prisma.groupMembership.findMany.bind(prisma.groupMembership);
      const spyFind = jest.spyOn(prisma.groupMembership, 'findMany').mockImplementationOnce(((
        args: Parameters<typeof findMany>[0],
      ) =>
        findMany({
          ...args,
          where: { ...args?.where, groupId: { in: [g.a, g.b] } },
        })) as unknown as typeof prisma.groupMembership.findMany);
      const real = (review as unknown as { riskRows: (...a: unknown[]) => Promise<unknown[]> })
        .riskRows;
      let chamadas = 0;
      const spyRows = jest
        .spyOn(review as unknown as { riskRows: () => Promise<unknown[]> }, 'riskRows')
        .mockImplementation(function (this: unknown, ...a: unknown[]) {
          chamadas += 1;
          if (chamadas === 1) return Promise.reject(new Error('falha de leitura'));
          return real.apply(review, a);
        } as never);
      try {
        const noite = new Date(`${todayInTz('America/Sao_Paulo')}T20:00:00Z`);
        await expect(review.sendRiskDigests(noite)).resolves.toBe(1);
        expect(chamadas).toBe(2);
        expect(notify).toHaveBeenCalledTimes(1);
        expect((notify.mock.calls[0] as [string[]])[0]).toEqual([ids.paula]);
      } finally {
        spyFind.mockRestore();
        spyRows.mockRestore();
        await prisma.groupMembership.updateMany({
          where: { userId: ids.paula, groupId: { in: [g.a, g.b] } },
          data: { riskDigest: false },
        });
      }
    });
  });
});
