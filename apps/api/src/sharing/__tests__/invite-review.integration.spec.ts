import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import type { EmailMessage, EmailService } from '../../notifications/email.service';
import { silentNotifications } from '../../notifications/__tests__/silent-notifications';
import { SeatPoolService } from '../../billing/seat-pool.service';
import { GroupService } from '../group.service';
import { InviteService, INVITE_MAX_SENDS } from '../invite.service';
import { MemberAdminService } from '../member-admin.service';
import { MembershipService } from '../membership.service';
import { ProfessionalLinkService } from '../professional-link.service';

/**
 * Convites com origem, ativação pendente e administração de membros (#401,
 * Pn-04, Pn-06, Pn-22). Contra Postgres real: o que importa aqui é o filtro
 * (comunidade da URL, alcance do papel, limiar de 5) e o efeito no banco.
 */
describe('convites #401: correções da revisão (integração)', () => {
  const prisma = new PrismaService();
  const links = new ProfessionalLinkService(prisma);
  const memberships = new MembershipService(prisma, links, silentNotifications);
  const enviados: EmailMessage[] = [];
  const email = {
    send: async (m: EmailMessage) => {
      enviados.push(m);
      return true;
    },
  } as unknown as EmailService;
  const SEGREDO = 'segredo-de-teste-do-link-401-com-variedade';
  const config = {
    get: (k: string) => (k === 'INVITE_LINK_SECRET' ? SEGREDO : 'https://fatia.test/'),
  } as unknown as ConfigService;
  const seats = new SeatPoolService(prisma, config, null);
  const invites = new InviteService(prisma, memberships, email, config, silentNotifications, seats);
  const admin = new MemberAdminService(prisma, seats);
  const groups = new GroupService(prisma, links, []);

  const DIA = 24 * 60 * 60 * 1000;
  const stamp = `t401r-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;
  const semConsentimento = { scopes: [], statsOptIn: false };

  async function pessoa(nome: string) {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: nome },
    });
    criados.push(user.id);
    return user;
  }

  async function comunidade() {
    const dono = await pessoa('Dona Helena');
    const g = await groups.create(dono.id, {
      type: 'SPONSORED',
      name: `Academia ${n}`,
      joinPolicy: 'APPROVAL',
      visibility: 'PRIVATE',
    });
    grupos.push(g.id);
    const donoM = await prisma.groupMembership.findUniqueOrThrow({
      where: { groupId_userId: { groupId: g.id, userId: dono.id } },
    });
    return { dono: dono.id, donoMembership: donoM.id, groupId: g.id };
  }

  async function membro(
    groupId: string,
    nome: string,
    extra: { role?: 'MEMBER' | 'PROFESSIONAL'; statsOptIn?: boolean; joinedAt?: Date } = {},
  ) {
    const u = await pessoa(nome);
    const m = await prisma.groupMembership.create({
      data: {
        groupId,
        userId: u.id,
        role: extra.role ?? 'MEMBER',
        status: 'ACTIVE',
        joinedAt: extra.joinedAt ?? new Date(),
        statsOptIn: extra.statsOptIn ?? false,
      },
    });
    return { userId: u.id, membershipId: m.id, email: u.email };
  }

  async function treinou(userId: string, quando: Date) {
    await prisma.workoutSession.create({
      data: { userId, startedAt: new Date(quando.getTime() - 3_600_000), completedAt: quando },
    });
  }

  /** Volta a data de criação (e de envio) do convite: "convidado há N dias". */
  async function envelhecer(inviteId: string, dias: number) {
    const quando = new Date(Date.now() - dias * DIA);
    await prisma.groupInvite.update({
      where: { id: inviteId },
      data: { createdAt: quando, lastSentAt: quando },
    });
  }

  function tokenDe(url: string) {
    return new URL(url).pathname.replace(/^\/c\//, '');
  }

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  async function poolDe(groupId: string, seats: number) {
    await prisma.groupSeatPool.create({
      data: { groupId, seats, unitPriceCents: 1490, status: 'ACTIVE' },
    });
  }

  const status = (e: unknown) => (e instanceof HttpException ? e.getStatus() : null);

  describe('1. reenviar e renovar não têm corrida', () => {
    it('cinco reenvios ao mesmo tempo: sai um só e o contador sobe um', async () => {
      const a = await comunidade();
      const c = await invites.create(a.dono, a.groupId, { role: 'MEMBER', email: 'c1@t.local' });
      await envelhecer(c.invite.id, 1);
      enviados.length = 0;
      const r = await Promise.allSettled(
        Array.from({ length: 5 }, () => invites.resend(a.dono, a.groupId, c.invite.id)),
      );
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      const depois = await prisma.groupInvite.findUniqueOrThrow({ where: { id: c.invite.id } });
      expect(depois.sendCount).toBe(2);
      expect(enviados).toHaveLength(1);
    });

    it('no limite, reenvios em lote simultâneos não passam de 5 envios', async () => {
      const a = await comunidade();
      const c = await invites.create(a.dono, a.groupId, { role: 'MEMBER', email: 'c2@t.local' });
      await envelhecer(c.invite.id, 1);
      await prisma.groupInvite.update({
        where: { id: c.invite.id },
        data: { sendCount: INVITE_MAX_SENDS - 1 },
      });
      const r = await Promise.all(
        Array.from({ length: 4 }, () => invites.resendMany(a.dono, a.groupId, [c.invite.id])),
      );
      expect(r.flatMap((x) => x.sent)).toHaveLength(1);
      const depois = await prisma.groupInvite.findUniqueOrThrow({ where: { id: c.invite.id } });
      expect(depois.sendCount).toBe(INVITE_MAX_SENDS);
    });

    it('renovar ao mesmo tempo: renova uma vez só', async () => {
      const a = await comunidade();
      const c = await invites.create(a.dono, a.groupId, { role: 'MEMBER', email: 'c3@t.local' });
      await envelhecer(c.invite.id, 31);
      await prisma.groupInvite.update({
        where: { id: c.invite.id },
        data: { expiresAt: new Date(Date.now() - DIA) },
      });
      enviados.length = 0;
      const r = await Promise.allSettled(
        Array.from({ length: 4 }, () => invites.renew(a.dono, a.groupId, c.invite.id)),
      );
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      const depois = await prisma.groupInvite.findUniqueOrThrow({ where: { id: c.invite.id } });
      expect(depois.sendCount).toBe(2);
      expect(enviados).toHaveLength(1);
    });
  });

  describe('2. "Ativaram em 48 h" não isola ninguém por diferença', () => {
    it('cenário A: convite X com 10 pessoas e Y com 1, todas com opt-in', async () => {
      const a = await comunidade();
      const x = await invites.create(a.dono, a.groupId, { role: 'MEMBER', label: 'X' });
      const y = await invites.create(a.dono, a.groupId, { role: 'MEMBER', label: 'Y' });
      const entrou = new Date(Date.now() - 5 * DIA);
      for (let i = 0; i < 10; i += 1) {
        const m = await membro(a.groupId, `X${i}`, { statsOptIn: true, joinedAt: entrou });
        await prisma.groupMembership.update({
          where: { id: m.membershipId },
          data: { joinedViaInviteId: x.invite.id },
        });
        if (i < 5) await treinou(m.userId, new Date(entrou.getTime() + 3_600_000 * 20));
      }
      const solo = await membro(a.groupId, 'Y0', { statsOptIn: true, joinedAt: entrou });
      await prisma.groupMembership.update({
        where: { id: solo.membershipId },
        data: { joinedViaInviteId: y.invite.id },
      });
      await treinou(solo.userId, new Date(entrou.getTime() + 3_600_000 * 20));

      const v = await invites.overview(a.dono, a.groupId);
      // A linha do convite não traz ativação: só quantos entraram, e só com 5 ou mais.
      for (const linha of v.invites) expect(linha).not.toHaveProperty('activated');
      expect(v.invites.find((i) => i.id === x.invite.id)!.joined).toBe(10);
      expect(v.invites.find((i) => i.id === y.invite.id)!.joined).toBeNull();
      // O cartão traz só o percentual, nunca o número junto.
      expect(v.cards.activated48h).toEqual({ percent: 55 });

      // A mesma população do "Entraram e sem 1º registro" (Pn-22): 11, 6 ativaram.
      const p = await invites.pending(a.dono, a.groupId, {});
      expect(p.cards.joinedNoFirstLog).toBe(5);
    });

    it('a população é a mesma: quem entrou pela página também conta nos dois', async () => {
      const a = await comunidade();
      const entrou = new Date(Date.now() - 5 * DIA);
      for (let i = 0; i < 10; i += 1) {
        const m = await membro(a.groupId, `P${i}`, { statsOptIn: true, joinedAt: entrou });
        if (i < 5) await treinou(m.userId, new Date(entrou.getTime() + 3_600_000 * 20));
      }
      const v = await invites.overview(a.dono, a.groupId);
      const p = await invites.pending(a.dono, a.groupId, {});
      expect(v.cards.activated48h).toEqual({ percent: 50 });
      expect(p.cards.joinedNoFirstLog).toBe(5);
    });
  });

  describe('3. convite de equipe tem prazo e limite', () => {
    it('sem prazo ou sem limite de usos é recusado; o prazo máximo é 30 dias', async () => {
      const a = await comunidade();
      await expect(
        invites.create(a.dono, a.groupId, { role: 'PROFESSIONAL', noExpiry: true, maxUses: 1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        invites.create(a.dono, a.groupId, { role: 'PROFESSIONAL', expiresInDays: 7 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      const ok = await invites.create(a.dono, a.groupId, {
        role: 'CREATOR',
        maxUses: 2,
        expiresInDays: 90,
      });
      const dias = (ok.invite.expiresAt!.getTime() - Date.now()) / DIA;
      expect(dias).toBeGreaterThan(29.9);
      expect(dias).toBeLessThanOrEqual(30);
    });
  });

  describe('4. recriar o convite não contorna os tetos', () => {
    it('5 envios por e-mail em 30 dias na comunidade, somando convites revogados', async () => {
      const a = await comunidade();
      const c = await invites.create(a.dono, a.groupId, { role: 'MEMBER', email: 'r1@t.local' });
      await prisma.groupInvite.update({
        where: { id: c.invite.id },
        data: { sendCount: INVITE_MAX_SENDS },
      });
      await invites.revoke(a.dono, a.groupId, c.invite.id);
      const erro = await invites
        .create(a.dono, a.groupId, { role: 'MEMBER', email: 'R1@t.local' })
        .catch((e: unknown) => e);
      expect(status(erro)).toBe(429);
      expect((erro as Error).message).not.toMatch(/revogue/i);
      const lote = await invites.createBatch(a.dono, a.groupId, {
        role: 'MEMBER',
        emails: ['r1@t.local'],
      });
      expect(lote.skipped).toEqual([{ email: 'r1@t.local', reason: 'limit' }]);
    });

    it('reenviar também respeita o teto por e-mail', async () => {
      const a = await comunidade();
      const velho = await invites.create(a.dono, a.groupId, {
        role: 'MEMBER',
        email: 'r2@t.local',
      });
      await prisma.groupInvite.update({ where: { id: velho.invite.id }, data: { sendCount: 4 } });
      await invites.revoke(a.dono, a.groupId, velho.invite.id);
      const novo = await invites.create(a.dono, a.groupId, { role: 'MEMBER', email: 'r2@t.local' });
      await envelhecer(novo.invite.id, 1);
      const erro = await invites.resend(a.dono, a.groupId, novo.invite.id).catch((e: unknown) => e);
      expect(status(erro)).toBe(429);
      expect((erro as Error).message).not.toMatch(/revogue/i);
    });

    it('quem recusou não recebe convite novo por 30 dias', async () => {
      const a = await comunidade();
      const bia = await pessoa('Bia');
      const c = await invites.create(a.dono, a.groupId, { role: 'MEMBER', email: bia.email });
      await invites.decline(bia.id, tokenDe(c.url));
      await expect(
        invites.create(a.dono, a.groupId, { role: 'MEMBER', email: bia.email }),
      ).rejects.toBeInstanceOf(ConflictException);
      const lote = await invites.createBatch(a.dono, a.groupId, {
        role: 'MEMBER',
        emails: [bia.email],
      });
      expect(lote.skipped).toEqual([{ email: bia.email, reason: 'declined' }]);
    });

    it('o convite individual recusa e-mail que já tem convite aberto, como o lote', async () => {
      const a = await comunidade();
      await invites.create(a.dono, a.groupId, { role: 'MEMBER', email: 'r3@t.local' });
      await expect(
        invites.create(a.dono, a.groupId, { role: 'MEMBER', email: 'r3@t.local' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('5. lote e trilha juntos', () => {
    it('targetCount é o número que mudou de fato', async () => {
      const a = await comunidade();
      await poolDe(a.groupId, 3);
      const m1 = await membro(a.groupId, 'T1');
      const m2 = await membro(a.groupId, 'T2');
      await admin.bulk(a.dono, a.groupId, { action: 'seat', membershipIds: [m1.membershipId] });
      const r = await admin.bulk(a.dono, a.groupId, {
        action: 'unseat',
        membershipIds: [m1.membershipId, m2.membershipId],
      });
      expect(r.updated).toBe(1);
      const trilha = await prisma.groupAuditLog.findFirstOrThrow({
        where: { groupId: a.groupId, action: 'members.unseat' },
      });
      expect(trilha.targetCount).toBe(1);
    });

    it('dois lotes de assento ao mesmo tempo não passam da conta, e só o que valeu fica na trilha', async () => {
      const a = await comunidade();
      await poolDe(a.groupId, 1);
      const m1 = await membro(a.groupId, 'U1');
      const m2 = await membro(a.groupId, 'U2');
      const r = await Promise.allSettled([
        admin.bulk(a.dono, a.groupId, { action: 'seat', membershipIds: [m1.membershipId] }),
        admin.bulk(a.dono, a.groupId, { action: 'seat', membershipIds: [m2.membershipId] }),
      ]);
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(
        await prisma.groupSeatAssignment.count({
          where: { pool: { groupId: a.groupId }, revokedAt: null },
        }),
      ).toBe(1);
      expect(
        await prisma.groupAuditLog.count({ where: { groupId: a.groupId, action: 'members.seat' } }),
      ).toBe(1);
    });

    it('aceites simultâneos de convite com assento não passam da conta', async () => {
      const a = await comunidade();
      await poolDe(a.groupId, 1);
      const c = await invites.create(a.dono, a.groupId, { role: 'MEMBER', giveSeat: true });
      const p1 = await pessoa('V1');
      const p2 = await pessoa('V2');
      const p3 = await pessoa('V3');
      await Promise.all(
        [p1, p2, p3].map((p) => invites.accept(p.id, tokenDe(c.url), semConsentimento)),
      );
      expect(
        await prisma.groupSeatAssignment.count({
          where: { pool: { groupId: a.groupId }, revokedAt: null },
        }),
      ).toBe(1);
    });
  });

  describe('7. código de entrada não guarda o que não usa', () => {
    it('acompanhante, assento ou "sem prazo" no código são recusados', async () => {
      const a = await comunidade();
      for (const extra of [
        { accompaniedByMembershipId: a.donoMembership },
        { giveSeat: true },
        { noExpiry: true },
      ]) {
        await expect(
          invites.create(a.dono, a.groupId, { role: 'MEMBER', code: true, ...extra }),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    });
  });

  describe('8. acompanhante só para membro', () => {
    it('trocar o acompanhante de um profissional é recusado, sozinho ou em lote', async () => {
      const a = await comunidade();
      const prof = await membro(a.groupId, 'Prof', { role: 'PROFESSIONAL' });
      const ana = await membro(a.groupId, 'Ana');
      await expect(
        admin.setAccompaniedBy(a.dono, a.groupId, prof.membershipId, a.donoMembership),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        admin.bulk(a.dono, a.groupId, {
          action: 'accompany',
          membershipIds: [ana.membershipId, prof.membershipId],
          accompaniedByMembershipId: a.donoMembership,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('9. aceite', () => {
    it('assento que falha não derruba o aceite', async () => {
      const a = await comunidade();
      await poolDe(a.groupId, 2);
      const c = await invites.create(a.dono, a.groupId, { role: 'MEMBER', giveSeat: true });
      const spy = jest.spyOn(seats, 'assignOnJoin').mockRejectedValueOnce(new Error('caiu'));
      const p = await pessoa('W1');
      try {
        await expect(invites.accept(p.id, tokenDe(c.url), semConsentimento)).resolves.toMatchObject(
          { status: 'ACTIVE' },
        );
      } finally {
        spy.mockRestore();
      }
    });

    it('recusado entre a leitura e a gravação: ninguém entra', async () => {
      const a = await comunidade();
      const bia = await pessoa('Bia');
      const c = await invites.create(a.dono, a.groupId, { role: 'MEMBER', email: bia.email });
      const lido = await prisma.groupInvite.findUniqueOrThrow({ where: { id: c.invite.id } });
      await prisma.groupInvite.update({
        where: { id: c.invite.id },
        data: { declinedAt: new Date() },
      });
      const spy = jest.spyOn(prisma.groupInvite, 'findUnique').mockResolvedValueOnce(lido as never);
      try {
        await expect(
          invites.accept(bia.id, tokenDe(c.url), semConsentimento),
        ).rejects.toBeInstanceOf(NotFoundException);
      } finally {
        spy.mockRestore();
      }
      expect(
        await prisma.groupMembership.findUnique({
          where: { groupId_userId: { groupId: a.groupId, userId: bia.id } },
        }),
      ).toBeNull();
    });
  });

  describe('10. WhatsApp reaproveita o link de 10 minutos', () => {
    it('duas vezes seguidas: o mesmo link, e o primeiro continua valendo', async () => {
      const a = await comunidade();
      const c = await invites.create(a.dono, a.groupId, { role: 'MEMBER', email: 'z1@t.local' });
      const r1 = await invites.freshLink(a.dono, a.groupId, c.invite.id);
      const r2 = await invites.freshLink(a.dono, a.groupId, c.invite.id);
      expect(r2.url).toBe(r1.url);
      expect(r2.reused).toBe(true);
      await expect(invites.preview(tokenDe(r1.url))).resolves.toBeDefined();
    });

    it('depois de 10 minutos, um link novo, e o anterior deixa de valer', async () => {
      const a = await comunidade();
      const c = await invites.create(a.dono, a.groupId, { role: 'MEMBER', email: 'z2@t.local' });
      const r1 = await invites.freshLink(a.dono, a.groupId, c.invite.id);
      await prisma.groupInvite.update({
        where: { id: c.invite.id },
        data: { linkIssuedAt: new Date(Date.now() - 11 * 60_000) },
      });
      const r2 = await invites.freshLink(a.dono, a.groupId, c.invite.id);
      expect(r2.url).not.toBe(r1.url);
      expect(r2.reused).toBe(false);
      await expect(invites.preview(tokenDe(r1.url))).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('13. e-mail vale 30 dias, sempre', () => {
    it('o prazo pedido é ignorado no convite por e-mail, sozinho ou em lote', async () => {
      const a = await comunidade();
      const r = await invites.create(a.dono, a.groupId, {
        role: 'MEMBER',
        email: 'e30@t.local',
        expiresInDays: 3,
      });
      expect((r.invite.expiresAt!.getTime() - Date.now()) / DIA).toBeGreaterThan(29.9);
      const lote = await invites.createBatch(a.dono, a.groupId, {
        role: 'MEMBER',
        emails: ['e31@t.local'],
        expiresInDays: 3,
      });
      const salvo = await prisma.groupInvite.findUniqueOrThrow({
        where: { id: lote.created[0]!.inviteId },
      });
      expect((salvo.expiresAt!.getTime() - Date.now()) / DIA).toBeGreaterThan(29.9);
    });
  });

  describe('15. link que não vale mais', () => {
    it('revogado ou vencido: sem "Copiar" (url nulo)', async () => {
      const a = await comunidade();
      const rev = await invites.create(a.dono, a.groupId, { role: 'MEMBER', label: 'Rev' });
      await invites.revoke(a.dono, a.groupId, rev.invite.id);
      const venc = await invites.create(a.dono, a.groupId, { role: 'MEMBER', label: 'Venc' });
      await prisma.groupInvite.update({
        where: { id: venc.invite.id },
        data: { expiresAt: new Date(Date.now() - DIA) },
      });
      const vivo = await invites.create(a.dono, a.groupId, { role: 'MEMBER', label: 'Vivo' });
      const v = await invites.overview(a.dono, a.groupId);
      const url = (id: string) => v.invites.find((i) => i.id === id)!.url;
      expect(url(rev.invite.id)).toBeNull();
      expect(url(venc.invite.id)).toBeNull();
      expect(url(vivo.invite.id)).toBe(vivo.url);
    });

    it('link derivado (HMAC) revogado é recusado no aceite e na prévia', async () => {
      const a = await comunidade();
      const c = await invites.create(a.dono, a.groupId, { role: 'MEMBER', label: 'HMAC' });
      await invites.revoke(a.dono, a.groupId, c.invite.id);
      const p = await pessoa('X1');
      await expect(invites.accept(p.id, tokenDe(c.url), semConsentimento)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(invites.preview(tokenDe(c.url))).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
