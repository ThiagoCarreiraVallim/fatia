import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ChallengeMetric, NotificationKind } from '@fatia/db';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import type { EmailService } from '../email.service';
import {
  GROUP_WINDOW_MS,
  MAX_DEVICES,
  NotificationService,
  RECEIPT_DELAY_MS,
} from '../notification.service';
import type { ExpoReceipt, PushMessage, PushService } from '../push.service';
import { DailyAdherenceService } from '../../nutrition/daily-adherence.service';
import { addDaysIso, todayInTz } from '../../progress/helpers/date-tz';
import { ScoreboardService } from '../../social/scoreboard.service';
import { ChallengeService } from '../../sharing/challenge.service';
import { GroupService } from '../../sharing/group.service';
import { InviteService } from '../../sharing/invite.service';
import { MembershipService } from '../../sharing/membership.service';
import { PostService } from '../../sharing/post.service';
import { ProfessionalLinkService } from '../../sharing/professional-link.service';
import { MediaService } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';

/**
 * Avisos no celular (Fase 8c, ADR 033) no Postgres real: cada aparelho é de
 * uma pessoa, a preferência desligada cala o tipo, e cada gatilho da
 * comunidade avisa quem deve — e só quem deve.
 */
describe('avisos no celular (integração)', () => {
  const prisma = new PrismaService();
  const enviados: PushMessage[] = [];
  let mortos: string[] = [];
  let ticketSeq = 0;
  /** Ticket → recibo que a "Expo" devolve na leitura (Fase 9g). */
  let recibos: Record<string, ExpoReceipt> = {};
  const push = {
    send: async (m: PushMessage[]) => {
      enviados.push(...m);
      const unregistered = m.map((x) => x.to).filter((t) => mortos.includes(t));
      const tickets = m
        .filter((x) => !unregistered.includes(x.to))
        .map((x) => ({ to: x.to, id: `tk-${Date.now()}-${++ticketSeq}` }));
      return { sent: m.length - unregistered.length, unregistered, tickets };
    },
    receipts: async (ids: string[]) =>
      Object.fromEntries(ids.filter((id) => recibos[id]).map((id) => [id, recibos[id]])),
  } as unknown as PushService;
  const notifications = new NotificationService(prisma, push);
  const links = new ProfessionalLinkService(prisma);
  const memberships = new MembershipService(prisma, links, notifications);
  const groups = new GroupService(prisma, links, [], null as never);
  const posts = new PostService(
    prisma,
    new MediaService(prisma, new MemoryObjectStore()),
    notifications,
  );
  const challenges = new ChallengeService(
    prisma,
    new ScoreboardService(prisma, new DailyAdherenceService(prisma)),
    notifications,
  );
  const invites = new InviteService(
    prisma,
    memberships,
    { send: async () => true } as unknown as EmailService,
    { get: () => 'https://fatia.test/' } as unknown as ConfigService,
    notifications,
  );

  const stamp = `aviso${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  const tokenDe = new Map<string, string>();
  let n = 0;

  /** Uma pessoa com um celular cadastrado. */
  async function pessoa(nome = 'Pessoa', celular = true) {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: `${nome} ${n}` },
    });
    criados.push(user.id);
    if (celular) {
      const token = `ExponentPushToken[${stamp}-${n}]`;
      await notifications.registerDevice(user.id, { token, platform: 'ANDROID' });
      tokenDe.set(user.id, token);
    }
    return user.id;
  }

  async function entra(groupId: string, role: 'MEMBER' | 'PROFESSIONAL', nome = 'Membro') {
    const id = await pessoa(nome);
    await prisma.groupMembership.create({
      data: { groupId, userId: id, role, status: 'ACTIVE', joinedAt: new Date() },
    });
    return id;
  }

  async function comunidade(joinPolicy: 'OPEN' | 'APPROVAL' = 'APPROVAL') {
    const dono = await pessoa('Dona');
    const g = await groups.create(dono, { type: 'SPONSORED', name: 'Academia', joinPolicy });
    grupos.push(g.id);
    return {
      groupId: g.id,
      slug: g.slug,
      dono,
      prof: await entra(g.id, 'PROFESSIONAL', 'Prof'),
      membro: await entra(g.id, 'MEMBER'),
      outro: await entra(g.id, 'MEMBER'),
    };
  }

  /** Quem recebeu o que, depois de esperar o envio em segundo plano. */
  async function recebidos() {
    await notifications.drain();
    const quem = new Map([...tokenDe].map(([u, t]) => [t, u]));
    const r = enviados.splice(0).map((m) => ({ ...m, userId: quem.get(m.to) }));
    return r;
  }

  beforeEach(async () => {
    await notifications.drain();
    enviados.splice(0);
    mortos = [];
  });

  afterAll(async () => {
    await notifications.drain();
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  describe('aparelhos', () => {
    it('o token é de uma conta só: registrar em outra conta tira da anterior', async () => {
      const a = await pessoa('A', false);
      const b = await pessoa('B', false);
      const token = `ExponentPushToken[${stamp}-troca]`;
      await notifications.registerDevice(a, { token, platform: 'IOS' });
      await notifications.registerDevice(b, { token, platform: 'IOS' });
      expect(await notifications.listDevices(a)).toEqual([]);
      expect(await notifications.listDevices(b)).toHaveLength(1);
    });

    it('apagar o aparelho de outra pessoa responde como inexistente e não apaga', async () => {
      const a = await pessoa('A');
      const b = await pessoa('B');
      const [doB] = await notifications.listDevices(b);
      await expect(notifications.removeDevice(a, doB!.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(await notifications.listDevices(b)).toHaveLength(1);
      await notifications.removeDevice(b, doB!.id);
      expect(await notifications.listDevices(b)).toEqual([]);
    });

    it('recusa o que não é token da Expo', async () => {
      const a = await pessoa('A', false);
      await expect(
        notifications.registerDevice(a, { token: 'https://evil.example', platform: 'IOS' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it(`guarda até ${MAX_DEVICES} aparelhos; o mais antigo sai`, async () => {
      const a = await pessoa('A', false);
      for (let i = 0; i <= MAX_DEVICES; i += 1) {
        await notifications.registerDevice(a, {
          token: `ExponentPushToken[${stamp}-lim-${i}]`,
          platform: 'ANDROID',
        });
      }
      const ficaram = await prisma.userDevice.findMany({ where: { userId: a } });
      expect(ficaram).toHaveLength(MAX_DEVICES);
      expect(ficaram.map((d) => d.token)).not.toContain(`ExponentPushToken[${stamp}-lim-0]`);
    });

    it('token que a Expo diz que morreu sai do cadastro', async () => {
      const c = await comunidade();
      const post = await posts.create(c.membro, c.groupId, { body: 'Oi', displayName: 'Ana' });
      mortos = [tokenDe.get(c.membro)!];
      await posts.comment(c.outro, c.groupId, post.id, { body: 'Boa!', displayName: 'Bia' });
      await recebidos();
      expect(await notifications.listDevices(c.membro)).toEqual([]);
      tokenDe.delete(c.membro);
    });

    it('apagar a conta leva aparelhos e preferências', async () => {
      const a = await pessoa('A');
      await notifications.setPreferences(a, { FEED: false });
      await prisma.user.delete({ where: { id: a } });
      expect(await prisma.userDevice.count({ where: { userId: a } })).toBe(0);
      expect(await prisma.notificationPreference.count({ where: { userId: a } })).toBe(0);
    });
  });

  describe('agrupamento e recibos (Fase 9g)', () => {
    it('comentários em sequência no mesmo post: o primeiro avisa, o resto sai junto no fim da janela', async () => {
      const c = await comunidade();
      const post = await posts.create(c.membro, c.groupId, { body: 'Oi', displayName: 'Ana' });
      for (const body of ['Boa!', 'Muito bom', 'Parabéns']) {
        await posts.comment(c.outro, c.groupId, post.id, { body, displayName: 'Bia' });
      }
      const agora = await recebidos();
      expect(agora.map((r) => r.title)).toEqual(['Bia comentou seu post']);

      // Antes do fim da janela, nada.
      expect(await notifications.flushGrouped(new Date())).toBe(0);
      expect(await recebidos()).toEqual([]);

      const depois = new Date(Date.now() + GROUP_WINDOW_MS + 1000);
      expect(await notifications.flushGrouped(depois)).toBe(1);
      const juntos = await recebidos();
      expect(juntos).toEqual([
        expect.objectContaining({
          userId: c.membro,
          title: 'Mais 2 comentários no seu post',
          body: expect.stringContaining('Academia'),
        }),
      ]);
      // Nada do que foi escrito vai no aviso.
      expect(JSON.stringify(juntos)).not.toMatch(/Parabéns|Muito bom/);

      // Janela fechada: o próximo comentário avisa na hora de novo.
      await posts.comment(c.outro, c.groupId, post.id, { body: 'Mais um', displayName: 'Bia' });
      expect((await recebidos()).map((r) => r.title)).toEqual(['Bia comentou seu post']);
    });

    it('janela vencida sem comentário novo não manda nada', async () => {
      const c = await comunidade();
      const post = await posts.create(c.membro, c.groupId, { body: 'Oi', displayName: 'Ana' });
      await posts.comment(c.outro, c.groupId, post.id, { body: 'Boa!', displayName: 'Bia' });
      await recebidos();
      await notifications.flushGrouped(new Date(Date.now() + GROUP_WINDOW_MS + 1000));
      expect(await recebidos()).toEqual([]);
      expect(await prisma.pendingNotice.count({ where: { userId: c.membro } })).toBe(0);
    });

    it('recibo DeviceNotRegistered apaga o aparelho; recibo lido sai da fila', async () => {
      const c = await comunidade();
      const post = await posts.create(c.membro, c.groupId, { body: 'Oi', displayName: 'Ana' });
      await posts.comment(c.outro, c.groupId, post.id, { body: 'Boa!', displayName: 'Bia' });
      await recebidos();
      const [device] = await prisma.userDevice.findMany({ where: { userId: c.membro } });
      const tickets = await prisma.pushTicket.findMany({ where: { deviceId: device!.id } });
      expect(tickets).toHaveLength(1);

      // Cedo demais: a Expo pede uns 15 minutos.
      expect((await notifications.checkReceipts(new Date())).read).toBe(0);

      recibos = {
        [tickets[0]!.id]: { status: 'error', details: { error: 'DeviceNotRegistered' } },
      };
      const r = await notifications.checkReceipts(new Date(Date.now() + RECEIPT_DELAY_MS + 1000));
      expect(r.removedDevices).toBeGreaterThanOrEqual(1);
      expect(await notifications.listDevices(c.membro)).toEqual([]);
      expect(await prisma.pushTicket.count({ where: { id: tickets[0]!.id } })).toBe(0);
      tokenDe.delete(c.membro);
      recibos = {};
    });

    it('ticket sem recibo há mais de 24 h é esquecido', async () => {
      const c = await comunidade();
      const [device] = await prisma.userDevice.findMany({ where: { userId: c.membro } });
      await prisma.pushTicket.create({
        data: {
          id: `velho-${Date.now()}`,
          deviceId: device!.id,
          createdAt: new Date(Date.now() - 25 * 3_600_000),
        },
      });
      await notifications.checkReceipts(new Date());
      expect(await prisma.pushTicket.count({ where: { deviceId: device!.id } })).toBe(0);
      expect(await notifications.listDevices(c.membro)).toHaveLength(1);
    });
  });

  describe('preferências', () => {
    it('tudo ligado por padrão; desligar um tipo cala só ele', async () => {
      const c = await comunidade();
      expect(await notifications.preferences(c.membro)).toEqual({
        COMMUNITY: true,
        CHALLENGES: true,
        FEED: true,
        MODERATION: true,
        CHAT: true,
      });
      await notifications.setPreferences(c.membro, { FEED: false });
      const post = await posts.create(c.membro, c.groupId, { body: 'Oi', displayName: 'Ana' });
      await posts.comment(c.outro, c.groupId, post.id, { body: 'Boa!', displayName: 'Bia' });
      expect(await recebidos()).toEqual([]);

      await posts.moderatePost(c.dono, c.groupId, post.id, 'remove');
      expect((await recebidos()).map((r) => r.userId)).toEqual([c.membro]);
    });
  });

  describe('mural', () => {
    it('comentário avisa o autor do post, sem o texto do comentário', async () => {
      const c = await comunidade();
      const post = await posts.create(c.membro, c.groupId, { body: 'Treino', displayName: 'Ana' });
      await posts.comment(c.outro, c.groupId, post.id, {
        body: 'Mensagem bem pessoal',
        displayName: 'Bia',
      });
      const r = await recebidos();
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({
        userId: c.membro,
        title: 'Bia comentou seu post',
        url: `/community/${c.groupId}/feed`,
      });
      expect(JSON.stringify(r)).not.toContain('Mensagem bem pessoal');
    });

    it('comentar no próprio post não avisa ninguém', async () => {
      const c = await comunidade();
      const post = await posts.create(c.membro, c.groupId, { body: 'Treino', displayName: 'Ana' });
      await posts.comment(c.membro, c.groupId, post.id, { body: 'Eu mesma' });
      expect(await recebidos()).toEqual([]);
    });

    it('quem saiu ou foi banido não recebe o aviso do post que ficou', async () => {
      const c = await comunidade();
      const post = await posts.create(c.membro, c.groupId, { body: 'Treino', displayName: 'Ana' });
      await memberships.leave(c.membro, c.groupId);
      await posts.comment(c.outro, c.groupId, post.id, { body: 'Boa', displayName: 'Bia' });
      expect(await recebidos()).toEqual([]);
    });

    it('remoção avisa o autor uma vez, pelo mural e pela fila', async () => {
      const c = await comunidade();
      const post = await posts.create(c.membro, c.groupId, { body: 'Oi', displayName: 'Ana' });
      await posts.moderatePost(c.dono, c.groupId, post.id, 'remove');
      await posts.moderatePost(c.dono, c.groupId, post.id, 'remove');
      const r = await recebidos();
      expect(r.map((x) => x.userId)).toEqual([c.membro]);
      expect(r[0]!.title).toBe('A equipe removeu seu post');

      const outro = await posts.create(c.membro, c.groupId, { body: 'De novo' });
      const com = await posts.comment(c.membro, c.groupId, outro.id, { body: 'Spam' });
      await posts.report(c.outro, c.groupId, outro.id, { commentId: com.id, reason: 'SPAM' });
      const fila = await posts.reports(c.dono, c.groupId);
      await posts.resolveReport(c.dono, c.groupId, fila[0]!.reportId, 'remove');
      const r2 = await recebidos();
      expect(r2.map((x) => [x.userId, x.title])).toEqual([
        [c.membro, 'A equipe removeu seu comentário'],
      ]);
    });
  });

  describe('desafios', () => {
    it('desafio novo avisa os membros ativos, menos quem marcou', async () => {
      const c = await comunidade();
      const fora = await pessoa('Pendente');
      await prisma.groupMembership.create({
        data: { groupId: c.groupId, userId: fora, role: 'MEMBER', status: 'INVITED' },
      });
      const hoje = todayInTz('America/Sao_Paulo');
      const d = await challenges.create(c.prof, c.groupId, {
        title: 'Semana da proteína',
        metric: ChallengeMetric.ACTIVE_DAYS,
        startDate: addDaysIso(hoje, 1),
        endDate: addDaysIso(hoje, 7),
      });
      const r = await recebidos();
      expect(r.map((x) => x.userId).sort()).toEqual([c.dono, c.membro, c.outro].sort());
      expect(r[0]).toMatchObject({
        title: 'Desafio novo em Academia',
        url: `/community/${c.groupId}/challenges/${d.id}`,
      });
    });

    it('fim do desafio avisa só quem participou, sem a posição', async () => {
      const c = await comunidade();
      const hoje = todayInTz('America/Sao_Paulo');
      const d = await challenges.create(c.dono, c.groupId, {
        title: 'Semana ativa',
        metric: ChallengeMetric.ACTIVE_DAYS,
        startDate: hoje,
        endDate: hoje,
      });
      await challenges.join(c.membro, c.groupId, d.id, 'Ana');
      // Entrou e depois saiu da comunidade: o desafio não é mais dela.
      await challenges.join(c.outro, c.groupId, d.id, 'Bia');
      await memberships.leave(c.outro, c.groupId);
      await recebidos();
      await prisma.groupChallenge.update({
        where: { id: d.id },
        data: { endsAt: new Date(Date.now() - 1000) },
      });
      await challenges.finalizeDue(new Date());
      const r = await recebidos();
      expect(r.map((x) => x.userId)).toEqual([c.membro]);
      expect(r[0]!.title).toBe('Semana ativa terminou');
      expect(r[0]!.body).not.toMatch(/\d+º|lugar|posição/);
    });
  });

  describe('entrada', () => {
    it('pedido avisa o dono; aprovação avisa quem pediu', async () => {
      const c = await comunidade('APPROVAL');
      const nova = await pessoa('Nova');
      const pedido = await memberships.requestJoin(nova, c.slug);
      const r = await recebidos();
      expect(r.map((x) => [x.userId, x.url])).toEqual([[c.dono, `/org/${c.groupId}/members`]]);

      await memberships.approve(c.dono, c.groupId, pedido.membershipId);
      const r2 = await recebidos();
      expect(r2.map((x) => [x.userId, x.title])).toEqual([[nova, 'Você entrou em Academia']]);
    });

    it('convite por e-mail avisa a conta do e-mail; e-mail sem conta não avisa ninguém', async () => {
      const c = await comunidade();
      const convidada = await pessoa('Convidada');
      const email = (await prisma.user.findUniqueOrThrow({ where: { id: convidada } })).email;
      const criado = await invites.create(c.dono, c.groupId, { role: 'MEMBER', email });
      const r = await recebidos();
      expect(r.map((x) => x.userId)).toEqual([convidada]);
      expect(criado.url.endsWith(r[0]!.url)).toBe(true);

      await invites.create(c.dono, c.groupId, {
        role: 'MEMBER',
        email: `${stamp}-ninguem@test.local`,
      });
      expect(await recebidos()).toEqual([]);
    });
  });

  it('os tipos do código são os do banco', () => {
    expect(Object.values(NotificationKind)).toEqual([
      'COMMUNITY',
      'CHALLENGES',
      'FEED',
      'MODERATION',
      'CHAT',
    ]);
  });
});
