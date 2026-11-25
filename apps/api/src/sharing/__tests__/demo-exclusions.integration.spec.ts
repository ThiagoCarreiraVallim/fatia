import { createHash, randomUUID } from 'node:crypto';
import { ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import { GroupRole, GroupType } from '@fatia/db';
import { DemoSessionService } from '../../auth/demo-session.service';
import { DEMO_EMAIL_DOMAIN } from '../../common/demo';
import { PrismaService } from '../../common/prisma.service';
import { ApiKeyService } from '../../integrations/api-key.service';
import { AnnouncementEmailService } from '../../notifications/announcement-email.service';
import { EmailService, type EmailMessage } from '../../notifications/email.service';
import { NotificationService } from '../../notifications/notification.service';
import type { PushMessage, PushService } from '../../notifications/push.service';
import type { WebPushService } from '../../notifications/web-push.service';
import { silentNotifications } from '../../notifications/__tests__/silent-notifications';
import { MediaService } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import { ExerciseService } from '../../workout/exercise.service';
import { AnnouncementService } from '../announcement.service';
import { challengeCreatedNotice } from '../community-notices';
import { DemoService } from '../demo.service';
import { GroupService } from '../group.service';
import { GroupRoleGuard } from '../guards/group-role.guard';
import { InviteService } from '../invite.service';
import { MembershipService } from '../membership.service';
import { offerSentNotice } from '../plan-offer-notices';
import type { GroupAction } from '../permissions';
import { PlanMaterializerService } from '../plan-materializer.service';
import { PostService } from '../post.service';
import { ProfessionalLinkService } from '../professional-link.service';
import { ReportEmailService } from '../report-email.service';
import { ReportService } from '../report.service';

/**
 * O que a comunidade de demonstração **não** faz (#412): não aparece em
 * listagem nem preview, não deixa ninguém entrar, não manda e-mail, push nem
 * aviso para fora, não abre cobrança nem chave de API, e o relatório do mês não
 * sai dela. Cada teste semeia a demo pelo serviço de verdade e confere o canal.
 */
describe('a demo fica fora de listagens, avisos e cobrança (integração, #412)', () => {
  const prisma = new PrismaService();
  const links = new ProfessionalLinkService(prisma);
  const groups = new GroupService(prisma, links, []);
  const demo = new DemoService(
    prisma,
    new DemoSessionService(prisma),
    new PlanMaterializerService(prisma, new ExerciseService(prisma)),
  );
  const memberships = new MembershipService(prisma, links, silentNotifications);
  const config = {
    get: (k: string) =>
      ({
        EMAIL_UNSUBSCRIBE_SECRET: 'segredo-de-teste-1234567890',
        WEB_ORIGIN: 'https://app.fatia.test',
      })[k],
  } as unknown as ConfigService;

  const emails: EmailMessage[] = [];
  const email = {
    enabled: true,
    available: true,
    send: async (m: EmailMessage) => {
      emails.push(m);
      return true;
    },
  } as unknown as EmailService;
  const invites = new InviteService(prisma, memberships, email, config, silentNotifications);

  const enviados: PushMessage[] = [];
  const push = {
    send: async (m: PushMessage[]) => {
      enviados.push(...m);
      return {
        sent: m.length,
        unregistered: [],
        tickets: m.map((x) => ({ to: x.to, id: `tk412-${randomUUID()}` })),
      };
    },
    receipts: async () => ({}),
  } as unknown as PushService;
  const webPush = {
    publicKey: () => null,
    send: async (alvos: unknown[]) => ({ gone: [], sent: alvos.length }),
  } as unknown as WebPushService;
  const notifications = new NotificationService(prisma, push, webPush);
  // Meio-dia em São Paulo: fora do silêncio noturno de todo mundo.
  notifications.clock = () => new Date('2026-11-16T15:00:00Z');
  const posts = new PostService(
    prisma,
    new MediaService(prisma, new MemoryObjectStore()),
    notifications,
  );
  const mail = new AnnouncementEmailService(prisma, email, config);
  const announcements = new AnnouncementService(prisma, posts, notifications, mail, config);

  const stamp = `t412x-${Date.now()}`;
  const usuarios: string[] = [];
  const grupos: string[] = [];
  const u = { dona: '', estranha: '', ana: '' };
  let real = '';
  let demoId = '';

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

  const tokenDe = (userId: string) => `ExponentPushToken[${stamp}-${userId}]`;

  beforeAll(async () => {
    u.dona = await pessoa('Bruno Lima');
    u.estranha = await pessoa('Estranha');
    const g = await groups.create(u.dona, { type: GroupType.SPONSORED, name: 'Academia Demo' });
    real = g.id;
    grupos.push(real);
    const { demo: d } = await demo.create(u.dona);
    demoId = d!.groupId;
    u.ana = d!.student.userId;
    // O pior caso: a demo "aberta" e a Ana com celular cadastrado. Nada disso
    // pode fazer a demo vazar.
    await prisma.group.update({
      where: { id: demoId },
      data: { visibility: 'PUBLIC', joinPolicy: 'OPEN', reportEmailEnabled: true },
    });
    await prisma.userDevice.createMany({
      data: [u.dona, u.ana].map((userId) => ({ userId, token: tokenDe(userId), platform: 'IOS' })),
    });
  });

  beforeEach(() => {
    emails.length = 0;
    enviados.length = 0;
  });

  afterAll(async () => {
    await Promise.all([notifications.drain(), announcements.drain()]);
    await demo.remove(u.dona);
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.$disconnect();
  });

  describe('listagens e entrada', () => {
    it('GET /groups da dona não traz a demo (só a comunidade de verdade)', async () => {
      const minhas = await groups.listMine(u.dona);
      expect(minhas.map((g) => g.id)).toEqual([real]);
    });

    it('a demo não tem preview nem entrada pelo slug, mesmo pública e aberta', async () => {
      const { slug } = await prisma.group.findUniqueOrThrow({ where: { id: demoId } });
      await expect(groups.previewByCode(slug)).rejects.toBeInstanceOf(NotFoundException);
      await expect(memberships.requestJoin(u.estranha, slug)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('nem pelo código de entrada ou pelo link de convite', async () => {
      const token = `${stamp}-convite`;
      await prisma.groupInvite.create({
        data: {
          groupId: demoId,
          createdById: u.dona,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          code: `D${Date.now().toString(36).toUpperCase()}`.slice(0, 10),
          role: GroupRole.MEMBER,
        },
      });
      const { code } = await prisma.groupInvite.findFirstOrThrow({ where: { groupId: demoId } });
      await expect(groups.previewByCode(code!)).rejects.toBeInstanceOf(NotFoundException);
      await expect(memberships.requestJoin(u.estranha, code!)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(invites.preview(token)).rejects.toBeInstanceOf(NotFoundException);
      await prisma.groupInvite.deleteMany({ where: { groupId: demoId } });
      expect(
        await prisma.groupMembership.count({ where: { groupId: demoId, userId: u.estranha } }),
      ).toBe(0);
    });
  });

  describe('avisos', () => {
    it('a Ana nunca recebe push, mesmo com celular cadastrado; a central dela guarda o aviso', async () => {
      notifications.notify(
        [u.ana],
        offerSentNotice({ offerId: randomUUID(), authorName: 'Bruno', title: 'Plano novo' }),
      );
      await notifications.drain();
      expect(enviados.map((m) => m.to)).not.toContain(tokenDe(u.ana));
      expect(await prisma.inboxNotice.count({ where: { userId: u.ana } })).toBeGreaterThan(0);
    });

    it('aviso de dentro da demo não chega à dona, nem na central', async () => {
      const antes = await prisma.inboxNotice.count({ where: { userId: u.dona } });
      const aviso = (groupId: string) =>
        challengeCreatedNotice({
          groupId,
          groupName: 'x',
          challengeId: randomUUID(),
          title: 'Constância',
        });
      notifications.notify([u.dona], aviso(demoId));
      await notifications.drain();
      expect(enviados).toEqual([]);
      expect(await prisma.inboxNotice.count({ where: { userId: u.dona } })).toBe(antes);

      // O mesmo aviso, da comunidade de verdade, sai normalmente.
      notifications.notify([u.dona], aviso(real));
      await notifications.drain();
      expect(enviados.map((m) => m.to)).toEqual([tokenDe(u.dona)]);
    });

    it('comunicado na demo fica no mural: nem push nem e-mail', async () => {
      const c = await announcements.create(u.dona, demoId, {
        title: 'Feriado',
        body: 'Fechado na sexta.',
        publishedAs: 'GROUP' as const,
        pin: false,
        pinDays: null,
        push: true,
        alsoEmail: true,
        at: null,
        repeat: 'NONE' as const,
      });
      await Promise.all([notifications.drain(), announcements.drain()]);
      expect(c.id).toBeTruthy();
      expect(enviados).toEqual([]);
      expect(emails).toEqual([]);
    });

    it('o e-mail para o endereço da Ana não sai, nem com o SMTP ligado', async () => {
      const smtp = new EmailService({
        get: () => 'smtp://localhost:2525',
      } as unknown as ConfigService);
      const sendMail = jest.fn().mockResolvedValue({});
      (smtp as unknown as { transport: { sendMail: typeof sendMail } }).transport = { sendMail };
      expect(
        await smtp.send({ to: `ana@${DEMO_EMAIL_DOMAIN}`, subject: 'x', text: 'x', html: 'x' }),
      ).toBe(false);
      expect(sendMail).not.toHaveBeenCalled();
      expect(
        await smtp.send({ to: 'pessoa@exemplo.com', subject: 'x', text: 'x', html: 'x' }),
      ).toBe(true);
      expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it('o relatório do mês não sai da demo', async () => {
      const job = new ReportEmailService(prisma, new ReportService(prisma), email, config);
      // 2 de dezembro, 10h em São Paulo: dia do envio para quem existia em novembro.
      await prisma.group.update({
        where: { id: demoId },
        data: { createdAt: new Date('2026-10-01T12:00:00Z') },
      });
      expect(await job.sendMonthlyReports(new Date('2026-12-02T13:00:00Z'), [demoId])).toBe(0);
      expect(emails).toEqual([]);
    });
  });

  describe('dentro da demo, o que sai ou cobra fica desligado', () => {
    const guard = (action: GroupAction) =>
      new GroupRoleGuard({ get: () => action } as unknown as Reflector, prisma);
    const ctx = (groupId: string) =>
      ({
        getHandler: () => () => undefined,
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: u.dona }, params: { groupId } }),
        }),
      }) as unknown as ExecutionContext;

    it.each<GroupAction>([
      'invite.create',
      'member.grant_reader',
      'member.approve',
      'member.remove',
      'member.role',
      'member.ban',
      'group.transfer',
      'billing.manage',
      'integration.manage',
    ])('%s: 403 na demo, liberado na comunidade de verdade', async (action) => {
      await expect(guard(action).canActivate(ctx(demoId))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(guard(action).canActivate(ctx(real))).resolves.toBe(true);
    });

    it.each<GroupAction>([
      'panel.overview',
      'member.plans',
      'content.publish',
      'announcement.publish',
      'challenge.manage',
      'group.update',
      'group.delete',
    ])('%s: o "Experimente" funciona dentro da demo', async (action) => {
      await expect(guard(action).canActivate(ctx(demoId))).resolves.toBe(true);
    });

    it('chave de API não nasce na demo (cota de API)', async () => {
      await expect(
        new ApiKeyService(prisma).create(u.dona, demoId, { name: 'Zapier' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await prisma.groupApiKey.count({ where: { groupId: demoId } })).toBe(0);
    });

    it('a demo não passa para outra pessoa (o banco também recusa)', async () => {
      await expect(
        prisma.group.update({ where: { id: demoId }, data: { ownerId: u.estranha } }),
      ).rejects.toThrow();
    });
  });
});
