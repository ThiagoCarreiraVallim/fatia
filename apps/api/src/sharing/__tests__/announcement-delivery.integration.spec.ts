import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import type { EmailMessage, EmailService } from '../../notifications/email.service';
import { NotificationService } from '../../notifications/notification.service';
import type { ExpoReceipt, PushMessage, PushService } from '../../notifications/push.service';
import type { WebPushService } from '../../notifications/web-push.service';
import {
  announcementUnsubscribeToken,
  AnnouncementEmailService,
  readAnnouncementUnsubscribeToken,
} from '../../notifications/announcement-email.service';
import { MediaService } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import { AnnouncementService } from '../announcement.service';
import { GroupService } from '../group.service';
import { PostService } from '../post.service';
import { ProfessionalLinkService } from '../professional-link.service';

/**
 * A entrega do comunicado no redesign do painel (#398): e-mail com
 * descadastro por link, limite semanal de avisos por comunidade e as contas
 * de mandadas e entregues (recibo da Expo).
 */
describe('entrega do comunicado (#398, integração)', () => {
  const prisma = new PrismaService();
  const SEGREDO = 'segredo-de-teste-do-descadastro-1234567890';
  const env: Record<string, string> = {
    EMAIL_UNSUBSCRIBE_SECRET: SEGREDO,
    WEB_ORIGIN: 'https://app.fatia.test',
    ANNOUNCEMENT_PUSH_WEEKLY_LIMIT: '3',
  };
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;

  const emails: EmailMessage[] = [];
  const email = {
    enabled: true,
    send: async (m: EmailMessage) => {
      emails.push(m);
      return true;
    },
  } as unknown as EmailService;

  let ticketSeq = 0;
  let recibos: Record<string, ExpoReceipt> = {};
  const enviados: PushMessage[] = [];
  const push = {
    send: async (m: PushMessage[]) => {
      enviados.push(...m);
      const tickets = m.map((x) => ({ to: x.to, id: `tk398-${Date.now()}-${++ticketSeq}` }));
      return { sent: m.length, unregistered: [], tickets };
    },
    receipts: async (ids: string[]) =>
      Object.fromEntries(ids.filter((id) => recibos[id]).map((id) => [id, recibos[id]])),
  } as unknown as PushService;
  const webPush = {
    publicKey: () => null,
    send: async () => ({ gone: [] }),
  } as unknown as WebPushService;
  const notifications = new NotificationService(prisma, push, webPush);
  notifications.clock = () => new Date('2026-11-16T15:00:00Z');
  const posts = new PostService(
    prisma,
    new MediaService(prisma, new MemoryObjectStore()),
    notifications,
  );
  const mail = new AnnouncementEmailService(prisma, email, config);
  const announcements = new AnnouncementService(prisma, posts, notifications, mail, config);
  const groups = new GroupService(prisma, new ProfessionalLinkService(prisma), []);

  const stamp = `entrega398-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;

  async function pessoa(nome: string) {
    n += 1;
    const u = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: nome },
    });
    criados.push(u.id);
    return u.id;
  }

  async function comunidade() {
    const dono = await pessoa('Dona');
    const g = await groups.create(dono, { type: 'SPONSORED', name: 'Academia Demo' });
    grupos.push(g.id);
    const entra = async (nome: string) => {
      const id = await pessoa(nome);
      await prisma.groupMembership.create({
        data: { groupId: g.id, userId: id, role: 'MEMBER', status: 'ACTIVE', joinedAt: new Date() },
      });
      await prisma.userDevice.create({
        data: { userId: id, token: `ExponentPushToken[${stamp}-${id}]`, platform: 'IOS' },
      });
      return id;
    };
    return { groupId: g.id, dono, ana: await entra('Ana'), bia: await entra('Bia') };
  }

  const agora = (extra: Partial<Parameters<AnnouncementService['create']>[2]> = {}) => ({
    title: 'Feriado de sexta',
    body: 'Abrimos das **8h às 14h**.',
    publishedAs: 'GROUP' as const,
    pin: false,
    pinDays: null,
    push: true,
    alsoEmail: false,
    at: null,
    repeat: 'NONE' as const,
    ...extra,
  });

  beforeEach(() => {
    emails.length = 0;
    enviados.length = 0;
  });

  afterAll(async () => {
    await Promise.all([notifications.drain(), announcements.drain()]);
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  describe('e-mail', () => {
    it('vai a quem deixou comunicados ligados, com link de descadastro próprio', async () => {
      const a = await comunidade();
      const caio = await pessoa('Caio');
      await prisma.groupMembership.create({
        data: { groupId: a.groupId, userId: caio, role: 'MEMBER', status: 'ACTIVE' },
      });
      // Caio desligou "Comunicados da comunidade": nem push, nem e-mail.
      await notifications.setPreferences(caio, { ANNOUNCEMENTS: false });

      const c = await announcements.create(a.dono, a.groupId, agora({ alsoEmail: true }));
      await Promise.all([notifications.drain(), announcements.drain()]);

      const para = emails.map((e) => e.to).sort();
      const quem = await prisma.user.findMany({
        where: { id: { in: [a.ana, a.bia] } },
        select: { email: true },
      });
      expect(para).toEqual(quem.map((u) => u.email).sort());
      for (const e of emails) {
        expect(e.subject).toContain('Feriado de sexta');
        expect(e.text).toContain('Abrimos das 8h às 14h');
        const link = /https:\/\/app\.fatia\.test\/descadastro\?t=([\w.-]+)/.exec(e.text);
        expect(link).not.toBeNull();
        expect(e.html).toContain('descadastro?t=');
      }
      const ana = await prisma.user.findUniqueOrThrow({ where: { id: a.ana } });
      const daAna = emails.find((e) => e.to === ana.email)!;
      const tokenDaAna = /descadastro\?t=([\w.-]+)/.exec(daAna.text)![1]!;
      expect(readAnnouncementUnsubscribeToken(tokenDaAna, SEGREDO)).toBe(a.ana);

      const linha = await prisma.groupAnnouncement.findUniqueOrThrow({ where: { id: c.id } });
      expect(linha.emailSent).toBe(2);
    });

    it('descadastro pelo link para o e-mail, sem login, e não mexe no push', async () => {
      const a = await comunidade();
      const t = announcementUnsubscribeToken(a.ana, SEGREDO);
      expect(await mail.status(t)).toEqual({ subscribed: true });
      expect(await mail.setSubscribed(t, false)).toEqual({ subscribed: false });

      await announcements.create(a.dono, a.groupId, agora({ alsoEmail: true }));
      await Promise.all([notifications.drain(), announcements.drain()]);
      const ana = await prisma.user.findUniqueOrThrow({ where: { id: a.ana } });
      expect(emails.map((e) => e.to)).not.toContain(ana.email);
      // O push continua: descadastrar é do e-mail.
      const devAna = await prisma.userDevice.findFirstOrThrow({ where: { userId: a.ana } });
      expect(enviados.map((p) => p.to)).toContain(devAna.token);

      expect(await mail.setSubscribed(t, true)).toEqual({ subscribed: true });
    });

    it('token adulterado, de outro segredo ou lixo não descadastra ninguém', async () => {
      const a = await comunidade();
      const bom = announcementUnsubscribeToken(a.ana, SEGREDO);
      const [id, assinatura] = bom.split('.');
      const daBia = announcementUnsubscribeToken(a.bia, SEGREDO).split('.')[1];
      for (const ruim of [
        `${id}.${daBia}`,
        announcementUnsubscribeToken(a.ana, 'outro-segredo-qualquer-1234567890'),
        `${id}.`,
        'lixo',
        '',
        `${Buffer.from(a.bia).toString('base64url')}.${assinatura}`,
      ]) {
        expect(readAnnouncementUnsubscribeToken(ruim, SEGREDO)).toBeNull();
        await expect(mail.setSubscribed(ruim, false)).rejects.toThrow();
      }
      const u = await prisma.user.findUniqueOrThrow({ where: { id: a.ana } });
      expect(u.announcementEmailOptOutAt).toBeNull();
    });

    it('sem segredo ou sem SMTP o e-mail fica indisponível, e o pedido não manda nada', async () => {
      const semSegredo = new AnnouncementEmailService(prisma, email, {
        get: (k: string) => (k === 'EMAIL_UNSUBSCRIBE_SECRET' ? '' : env[k]),
      } as unknown as ConfigService);
      expect(semSegredo.available).toBe(false);
      const semSmtp = new AnnouncementEmailService(
        prisma,
        { enabled: false, send: async () => false } as unknown as EmailService,
        config,
      );
      expect(semSmtp.available).toBe(false);
      expect(mail.available).toBe(true);
    });
  });

  describe('limite semanal e contas', () => {
    it('passou do limite da semana, sai no mural sem notificação nem e-mail', async () => {
      const a = await comunidade();
      for (let i = 0; i < 3; i++) {
        await announcements.create(a.dono, a.groupId, agora({ title: `Aviso ${i}` }));
      }
      await Promise.all([notifications.drain(), announcements.drain()]);
      expect(await announcements.settings(a.dono, a.groupId)).toMatchObject({
        pushWeeklyLimit: 3,
        pushUsedThisWeek: 3,
        emailAvailable: true,
      });
      enviados.length = 0;
      emails.length = 0;

      const quarto = await announcements.create(
        a.dono,
        a.groupId,
        agora({ title: 'Quarto', alsoEmail: true }),
      );
      await Promise.all([notifications.drain(), announcements.drain()]);
      expect(enviados).toEqual([]);
      expect(emails).toEqual([]);
      const post = await prisma.groupPost.findFirstOrThrow({
        where: { announcementId: quarto.id },
      });
      expect(post.notifiedAt).toBeNull();
      expect(quarto.pushSkipped).toBe(true);
    });

    it('comunicado sem push nem e-mail não gasta o limite', async () => {
      const a = await comunidade();
      await announcements.create(a.dono, a.groupId, agora({ push: false }));
      expect((await announcements.settings(a.dono, a.groupId)).pushUsedThisWeek).toBe(0);
    });

    it('conta notificações mandadas e as que a Expo confirmou', async () => {
      const a = await comunidade();
      const c = await announcements.create(a.dono, a.groupId, agora());
      await Promise.all([notifications.drain(), announcements.drain()]);
      let linha = await prisma.groupAnnouncement.findUniqueOrThrow({ where: { id: c.id } });
      expect(linha.pushSent).toBe(2);

      const tickets = await prisma.pushTicket.findMany({ where: { announcementId: c.id } });
      expect(tickets).toHaveLength(2);
      recibos = {
        [tickets[0]!.id]: { status: 'ok' },
        [tickets[1]!.id]: { status: 'error', details: { error: 'MessageRateExceeded' } },
      };
      // Envelhece só os tickets deste teste: ler recibos com o relógio adiantado
      // levaria os tickets das outras suítes que rodam junto.
      await prisma.pushTicket.updateMany({
        where: { announcementId: c.id },
        data: { createdAt: new Date(Date.now() - 20 * 60_000) },
      });
      await notifications.checkReceipts(new Date());
      linha = await prisma.groupAnnouncement.findUniqueOrThrow({ where: { id: c.id } });
      expect(linha.pushDelivered).toBe(1);
      expect((await announcements.list(a.dono, a.groupId)).length).toBe(0);
    });

    it('o limite é de cada comunidade', async () => {
      const a = await comunidade();
      const b = await comunidade();
      for (let i = 0; i < 3; i++) await announcements.create(a.dono, a.groupId, agora());
      expect((await announcements.settings(b.dono, b.groupId)).pushUsedThisWeek).toBe(0);
    });
  });
});
