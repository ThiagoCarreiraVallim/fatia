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
    send: async (alvos: unknown[]) => ({ gone: [], sent: alvos.length }),
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
      expect(await mail.status(t)).toEqual({ subscribed: true, kind: 'announcements' });
      expect(await mail.setSubscribed(t, false)).toEqual({
        subscribed: false,
        kind: 'announcements',
      });

      await announcements.create(a.dono, a.groupId, agora({ alsoEmail: true }));
      await Promise.all([notifications.drain(), announcements.drain()]);
      const ana = await prisma.user.findUniqueOrThrow({ where: { id: a.ana } });
      expect(emails.map((e) => e.to)).not.toContain(ana.email);
      // O push continua: descadastrar é do e-mail.
      const devAna = await prisma.userDevice.findFirstOrThrow({ where: { userId: a.ana } });
      expect(enviados.map((p) => p.to)).toContain(devAna.token);

      expect(await mail.setSubscribed(t, true)).toEqual({
        subscribed: true,
        kind: 'announcements',
      });
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
      expect(quarto.pushSkipped).toBe(true);
      expect(
        await prisma.announcementDispatch.count({ where: { announcementId: quarto.id } }),
      ).toBe(0);
      expect(post.id).toBeTruthy();
    });

    it('apagar o post não devolve a vaga da semana', async () => {
      const a = await comunidade();
      const ids = [];
      for (let i = 0; i < 3; i++) {
        ids.push((await announcements.create(a.dono, a.groupId, agora({ title: `A${i}` }))).id);
      }
      await Promise.all([notifications.drain(), announcements.drain()]);
      await prisma.groupPost.deleteMany({ where: { announcementId: { in: ids } } });
      await prisma.groupAnnouncement.deleteMany({ where: { id: { in: ids } } });
      expect((await announcements.settings(a.dono, a.groupId)).pushUsedThisWeek).toBe(3);
      enviados.length = 0;
      const quarto = await announcements.create(a.dono, a.groupId, agora({ title: 'De novo' }));
      await Promise.all([notifications.drain(), announcements.drain()]);
      expect(quarto.pushSkipped).toBe(true);
      expect(enviados).toEqual([]);
    });

    it('pedidos ao mesmo tempo não furam o teto da semana', async () => {
      const a = await comunidade();
      const saidas = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          announcements.create(a.dono, a.groupId, agora({ title: `Junto ${i}` })),
        ),
      );
      await Promise.all([notifications.drain(), announcements.drain()]);
      expect(saidas.filter((x) => !x.pushSkipped)).toHaveLength(3);
      expect(await prisma.announcementDispatch.count({ where: { groupId: a.groupId } })).toBe(3);
    });

    it('sem ninguém para avisar, não gasta a vaga', async () => {
      const dono = await pessoa('Dona sozinha');
      const g = await groups.create(dono, { type: 'SPONSORED', name: 'Vazia' });
      grupos.push(g.id);
      const c = await announcements.create(dono, g.id, agora({ alsoEmail: true }));
      expect(c.pushSkipped).toBe(false);
      expect((await announcements.settings(dono, g.id)).pushUsedThisWeek).toBe(0);
    });

    it('quem desligou comunicados não conta como destinatário da vaga', async () => {
      const a = await comunidade();
      await notifications.setPreferences(a.ana, { ANNOUNCEMENTS: false });
      await notifications.setPreferences(a.bia, { ANNOUNCEMENTS: false });
      await announcements.create(a.dono, a.groupId, agora());
      expect((await announcements.settings(a.dono, a.groupId)).pushUsedThisWeek).toBe(0);
    });

    it('o disparo atrasado registra a hora em que saiu, não a planejada', async () => {
      const a = await comunidade();
      const previsto = new Date(Math.ceil((Date.now() + 60_000) / 900_000) * 900_000);
      const c = await announcements.create(
        a.dono,
        a.groupId,
        agora({ at: previsto.toISOString() }),
      );
      const atrasado = new Date(previsto.getTime() + 3 * 3_600_000);
      await announcements.runDue(atrasado);
      await Promise.all([notifications.drain(), announcements.drain()]);
      const d = await prisma.announcementDispatch.findFirstOrThrow({
        where: { announcementId: c.id },
      });
      expect(d.at.getTime()).toBe(atrasado.getTime());
    });

    it('erro no aviso depois de o post sair não derruba o pedido nem duplica o post', async () => {
      const a = await comunidade();
      const original = notifications.notify.bind(notifications);
      notifications.notify = () => {
        throw new Error('fila caiu');
      };
      try {
        const c = await announcements.create(a.dono, a.groupId, agora({ title: 'Uma vez' }));
        expect(await prisma.groupPost.count({ where: { announcementId: c.id } })).toBe(1);
      } finally {
        notifications.notify = original;
      }
    });

    it('notificações mandadas somam o push no navegador', async () => {
      const a = await comunidade();
      await prisma.webPushSubscription.create({
        data: {
          userId: a.ana,
          endpoint: `https://push.test/${stamp}-${a.ana}`,
          p256dh: 'p',
          auth: 'a',
        },
      });
      const c = await announcements.create(a.dono, a.groupId, agora());
      await Promise.all([notifications.drain(), announcements.drain()]);
      const linha = await prisma.groupAnnouncement.findUniqueOrThrow({ where: { id: c.id } });
      expect(linha.pushSent).toBe(3);
    });

    it('HTML no título, no nome da comunidade e no texto sai escapado no e-mail', async () => {
      const dono = await pessoa('Dona');
      const g = await groups.create(dono, { type: 'SPONSORED', name: '<b>Academia</b>' });
      grupos.push(g.id);
      const ana = await pessoa('Ana');
      await prisma.groupMembership.create({
        data: { groupId: g.id, userId: ana, role: 'MEMBER', status: 'ACTIVE' },
      });
      await announcements.create(
        dono,
        g.id,
        agora({
          title: '<script>alert(1)</script>',
          body: '<img src=x onerror=alert(1)>',
          alsoEmail: true,
          push: false,
        }),
      );
      await announcements.drain();
      expect(emails).toHaveLength(1);
      expect(emails[0]!.html).not.toMatch(/<script|<img|<b>Academia/);
      expect(emails[0]!.headers!['List-Unsubscribe']).toMatch(
        /^<https:\/\/app\.fatia\.test\/api\/descadastro\?t=[\w.-]+>$/,
      );
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
