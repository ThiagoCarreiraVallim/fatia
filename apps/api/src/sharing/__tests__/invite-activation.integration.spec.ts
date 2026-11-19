import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
describe('convites, ativação e membros (#401, integração)', () => {
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
  const stamp = `t401-${Date.now()}`;
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

  describe('criar convite: nome, origem e validade', () => {
    it('link "QR · recepção" sem prazo: guarda nome e origem, e quem entra fica com o convite', async () => {
      const a = await comunidade();
      const r = await invites.create(a.dono, a.groupId, {
        role: 'MEMBER',
        label: 'QR · recepção',
        origin: 'QR',
        noExpiry: true,
      });
      expect(r.invite).toMatchObject({ label: 'QR · recepção', origin: 'QR', expiresAt: null });

      const preview = await invites.preview(tokenDe(r.url));
      expect(preview.expiresAt).toBeNull();

      const ana = await pessoa('Ana');
      await invites.accept(ana.id, tokenDe(r.url), semConsentimento);
      const m = await prisma.groupMembership.findUniqueOrThrow({
        where: { groupId_userId: { groupId: a.groupId, userId: ana.id } },
      });
      expect(m).toMatchObject({
        status: 'ACTIVE',
        joinVia: 'INVITE',
        joinedViaInviteId: r.invite.id,
      });
    });

    it('e-mail não fica sem prazo: vale 30 dias e uma vez, e o e-mail diz isso', async () => {
      const a = await comunidade();
      await expect(
        invites.create(a.dono, a.groupId, {
          role: 'MEMBER',
          email: 'sem-prazo@test.local',
          noExpiry: true,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      enviados.length = 0;
      const antes = Date.now();
      const r = await invites.create(a.dono, a.groupId, {
        role: 'MEMBER',
        email: 'trinta@test.local',
      });
      const dias = (r.invite.expiresAt!.getTime() - antes) / DIA;
      expect(dias).toBeGreaterThan(29.9);
      expect(dias).toBeLessThan(30.1);
      expect(r.invite.origin).toBe('EMAIL_LIST');
      expect(r.invite.sendCount).toBe(1);
      expect(enviados[0]!.text).toContain('Vale por 30 dias e uma vez');
    });

    it('o link pode ser copiado depois (deriva do segredo); o e-mail nominal, não', async () => {
      const a = await comunidade();
      const link = await invites.create(a.dono, a.groupId, {
        role: 'MEMBER',
        label: 'Instagram',
        origin: 'INSTAGRAM',
        expiresInDays: 30,
      });
      await invites.create(a.dono, a.groupId, { role: 'MEMBER', email: 'nominal@test.local' });
      const visao = await invites.overview(a.dono, a.groupId);
      const linha = visao.invites.find((i) => i.id === link.invite.id)!;
      expect(linha.url).toBe(link.url);
      expect(visao.invites.find((i) => i.email === 'nominal@test.local')!.url).toBeNull();
    });

    it('"Acompanhado por" só aceita profissional ativo da mesma comunidade; o profissional só põe a si', async () => {
      const a = await comunidade();
      const b = await comunidade();
      const helena = await membro(a.groupId, 'Helena', { role: 'PROFESSIONAL' });
      const rafa = await membro(a.groupId, 'Rafa', { role: 'PROFESSIONAL' });
      const deB = await membro(b.groupId, 'Prof de B', { role: 'PROFESSIONAL' });
      const aluna = await membro(a.groupId, 'Aluna');

      await expect(
        invites.create(a.dono, a.groupId, {
          role: 'MEMBER',
          accompaniedByMembershipId: deB.membershipId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        invites.create(a.dono, a.groupId, {
          role: 'MEMBER',
          accompaniedByMembershipId: aluna.membershipId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        invites.create(helena.userId, a.groupId, {
          role: 'MEMBER',
          accompaniedByMembershipId: rafa.membershipId,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const r = await invites.create(a.dono, a.groupId, {
        role: 'MEMBER',
        accompaniedByMembershipId: helena.membershipId,
      });
      const bia = await pessoa('Bia');
      await invites.accept(bia.id, tokenDe(r.url), semConsentimento);
      const m = await prisma.groupMembership.findUniqueOrThrow({
        where: { groupId_userId: { groupId: a.groupId, userId: bia.id } },
      });
      expect(m.accompaniedById).toBe(helena.membershipId);
    });

    it('"Dar assento PRO": quem entra ganha assento se houver vaga, e entra no Free se não', async () => {
      const a = await comunidade();
      await prisma.groupSeatPool.create({
        data: { groupId: a.groupId, seats: 1, unitPriceCents: 1490, status: 'ACTIVE' },
      });
      const r = await invites.create(a.dono, a.groupId, { role: 'MEMBER', giveSeat: true });
      const [c1, c2] = [await pessoa('Caio'), await pessoa('Duda')];
      await invites.accept(c1.id, tokenDe(r.url), semConsentimento);
      await invites.accept(c2.id, tokenDe(r.url), semConsentimento);
      const assentos = await prisma.groupSeatAssignment.findMany({
        where: { pool: { groupId: a.groupId }, revokedAt: null },
        select: { membership: { select: { userId: true } } },
      });
      expect(assentos.map((s) => s.membership.userId)).toEqual([c1.id]);
    });

    it('o profissional não dá assento (é cobrança, do dono)', async () => {
      const a = await comunidade();
      const prof = await membro(a.groupId, 'Prof', { role: 'PROFESSIONAL' });
      await expect(
        invites.create(prof.userId, a.groupId, { role: 'MEMBER', giveSeat: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('aceite e recusa do convite por e-mail', () => {
    it('aceitar marca quem e quando no convite', async () => {
      const a = await comunidade();
      const ana = await pessoa('Ana Aceita');
      const r = await invites.create(a.dono, a.groupId, { role: 'MEMBER', email: ana.email });
      await invites.accept(ana.id, tokenDe(r.url), semConsentimento);
      const c = await prisma.groupInvite.findUniqueOrThrow({ where: { id: r.invite.id } });
      expect(c.acceptedById).toBe(ana.id);
      expect(c.acceptedAt).not.toBeNull();
    });

    it('recusar: só a conta do e-mail recusa; depois o convite não vale mais', async () => {
      const a = await comunidade();
      const ana = await pessoa('Ana Recusa');
      const outra = await pessoa('Outra');
      const r = await invites.create(a.dono, a.groupId, { role: 'MEMBER', email: ana.email });
      await expect(invites.decline(outra.id, tokenDe(r.url))).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await invites.decline(ana.id, tokenDe(r.url));
      const c = await prisma.groupInvite.findUniqueOrThrow({ where: { id: r.invite.id } });
      expect(c.declinedAt).not.toBeNull();
      await expect(invites.preview(tokenDe(r.url))).rejects.toBeInstanceOf(NotFoundException);
    });

    it('link de vários usos não se recusa (não é de ninguém)', async () => {
      const a = await comunidade();
      const r = await invites.create(a.dono, a.groupId, { role: 'MEMBER' });
      const ana = await pessoa('Ana Link');
      await expect(invites.decline(ana.id, tokenDe(r.url))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('ativação pendente (Pn-22)', () => {
    it('entra quem não aceitou em 2 dias, mais antigos primeiro; expirado aparece como expirado', async () => {
      const a = await comunidade();
      const novo = await invites.create(a.dono, a.groupId, {
        role: 'MEMBER',
        email: 'novo@t.local',
      });
      const tres = await invites.create(a.dono, a.groupId, {
        role: 'MEMBER',
        email: 'tres@t.local',
      });
      const nove = await invites.create(a.dono, a.groupId, {
        role: 'MEMBER',
        email: 'nove@t.local',
      });
      const velho = await invites.create(a.dono, a.groupId, {
        role: 'MEMBER',
        email: 'velho@t.local',
      });
      await envelhecer(tres.invite.id, 3);
      await envelhecer(nove.invite.id, 9);
      await envelhecer(velho.invite.id, 31);
      await prisma.groupInvite.update({
        where: { id: velho.invite.id },
        data: { expiresAt: new Date(Date.now() - DIA) },
      });

      const r = await invites.pending(a.dono, a.groupId, {});
      expect(r.items.map((i) => i.email)).toEqual([
        'velho@t.local',
        'nove@t.local',
        'tres@t.local',
      ]);
      expect(r.items.map((i) => i.status)).toEqual(['expired', 'pending', 'pending']);
      expect(r.items.find((i) => i.id === novo.invite.id)).toBeUndefined();
      expect(r.total).toBe(3);
      // Menos de 5: os totais somem, a lista fica.
      expect(r.cards.notAccepted).toBeNull();
      expect(r.cards.acceptedThisMonth).toBeNull();
    });

    it('busca, filtro por origem e páginas de 10', async () => {
      const a = await comunidade();
      for (let i = 0; i < 12; i += 1) {
        const c = await invites.create(a.dono, a.groupId, {
          role: 'MEMBER',
          email: `p${String(i).padStart(2, '0')}@t.local`,
        });
        await envelhecer(c.invite.id, 20 - i);
      }
      const p1 = await invites.pending(a.dono, a.groupId, {});
      expect(p1.total).toBe(12);
      expect(p1.items).toHaveLength(10);
      expect(p1.items[0]!.email).toBe('p00@t.local');
      const p2 = await invites.pending(a.dono, a.groupId, { page: 2 });
      expect(p2.items.map((i) => i.email)).toEqual(['p10@t.local', 'p11@t.local']);
      const busca = await invites.pending(a.dono, a.groupId, { q: 'P07' });
      expect(busca.items.map((i) => i.email)).toEqual(['p07@t.local']);
      const origem = await invites.pending(a.dono, a.groupId, { origin: 'QR' });
      expect(origem.total).toBe(0);
      expect(p1.origins).toEqual([{ origin: 'EMAIL_LIST', count: 12 }]);
      // 12 sem aceite nos últimos 30 dias: o total aparece.
      expect(p1.cards.notAccepted).toBe(12);
    });

    it('"Entraram e sem 1º registro" é só o número, e só com 5 ou mais de cada lado', async () => {
      const a = await comunidade();
      const entrou = new Date(Date.now() - 10 * DIA);
      for (let i = 0; i < 5; i += 1) {
        const m = await membro(a.groupId, `Ativa ${i}`, { statsOptIn: true, joinedAt: entrou });
        await treinou(m.userId, new Date(entrou.getTime() + 20 * 3_600_000));
      }
      for (let i = 0; i < 5; i += 1) {
        const m = await membro(a.groupId, `Parada ${i}`, { statsOptIn: true, joinedAt: entrou });
        // Treinou, mas depois das 48 h: não ativou.
        await treinou(m.userId, new Date(entrou.getTime() + 4 * DIA));
      }
      // Sem opt-in não entra na conta.
      await membro(a.groupId, 'Sem opt-in', { joinedAt: entrou });
      const r = await invites.pending(a.dono, a.groupId, {});
      expect(r.cards.joinedNoFirstLog).toBe(5);
      expect(JSON.stringify(r)).not.toContain('Parada');

      const b = await comunidade();
      for (let i = 0; i < 4; i += 1) {
        await membro(b.groupId, `Pouca ${i}`, { statsOptIn: true, joinedAt: entrou });
      }
      expect((await invites.pending(b.dono, b.groupId, {})).cards.joinedNoFirstLog).toBeNull();
    });

    it('reenviar em lote: id de outra comunidade não passa, e o teto de reenvios vale', async () => {
      const a = await comunidade();
      const b = await comunidade();
      const deA = await invites.create(a.dono, a.groupId, { role: 'MEMBER', email: 'ra@t.local' });
      const cheio = await invites.create(a.dono, a.groupId, {
        role: 'MEMBER',
        email: 'rc@t.local',
      });
      const deB = await invites.create(b.dono, b.groupId, { role: 'MEMBER', email: 'rb@t.local' });
      await envelhecer(deA.invite.id, 3);
      await envelhecer(cheio.invite.id, 3);
      await envelhecer(deB.invite.id, 3);
      await prisma.groupInvite.update({
        where: { id: cheio.invite.id },
        data: { sendCount: INVITE_MAX_SENDS },
      });

      const tokenAntes = (
        await prisma.groupInvite.findUniqueOrThrow({ where: { id: deA.invite.id } })
      ).tokenHash;
      const r = await invites.resendMany(a.dono, a.groupId, [
        deA.invite.id,
        cheio.invite.id,
        deB.invite.id,
      ]);
      expect(r.sent.map((s) => s.id)).toEqual([deA.invite.id]);
      expect(r.skipped).toEqual(
        expect.arrayContaining([
          { id: cheio.invite.id, reason: 'limit' },
          { id: deB.invite.id, reason: 'not_found' },
        ]),
      );
      const depois = await prisma.groupInvite.findUniqueOrThrow({ where: { id: deA.invite.id } });
      expect(depois.tokenHash).not.toBe(tokenAntes);
      expect(depois.sendCount).toBe(2);
      const intacto = await prisma.groupInvite.findUniqueOrThrow({ where: { id: deB.invite.id } });
      expect(intacto.sendCount).toBe(1);

      // Logo de novo: cedo demais.
      const deNovo = await invites.resendMany(a.dono, a.groupId, [deA.invite.id]);
      expect(deNovo.skipped).toEqual([{ id: deA.invite.id, reason: 'too_soon' }]);
    });

    it('"Enviar convite novo" só para o expirado: mais 30 dias, e não serve para outra comunidade', async () => {
      const a = await comunidade();
      const b = await comunidade();
      const vivo = await invites.create(a.dono, a.groupId, { role: 'MEMBER', email: 'v@t.local' });
      const venceu = await invites.create(a.dono, a.groupId, {
        role: 'MEMBER',
        email: 'x@t.local',
      });
      await envelhecer(venceu.invite.id, 31);
      await prisma.groupInvite.update({
        where: { id: venceu.invite.id },
        data: { expiresAt: new Date(Date.now() - DIA) },
      });
      await expect(invites.renew(a.dono, a.groupId, vivo.invite.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(invites.renew(b.dono, b.groupId, venceu.invite.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      const r = await invites.renew(a.dono, a.groupId, venceu.invite.id);
      expect((r.invite.expiresAt!.getTime() - Date.now()) / DIA).toBeGreaterThan(29.9);
      expect(r.invite.status).toBe('active');
    });

    it('WhatsApp: gera um link novo sem mandar e-mail', async () => {
      const a = await comunidade();
      const c = await invites.create(a.dono, a.groupId, { role: 'MEMBER', email: 'w@t.local' });
      enviados.length = 0;
      const r = await invites.freshLink(a.dono, a.groupId, c.invite.id);
      expect(enviados).toHaveLength(0);
      const preview = await invites.preview(tokenDe(r.url));
      expect(preview.emailBound).toBe(true);
    });
  });

  describe('convites: cartões e colunas (Pn-06)', () => {
    it('"Entraram" por convite só com 5 ou mais; revogado e expirado aparecem inativos', async () => {
      const a = await comunidade();
      const recepcao = await invites.create(a.dono, a.groupId, {
        role: 'MEMBER',
        label: 'Recepção',
        origin: 'QR',
        noExpiry: true,
      });
      const poucos = await invites.create(a.dono, a.groupId, {
        role: 'MEMBER',
        label: 'Indicação',
        origin: 'REFERRAL',
      });
      const revogado = await invites.create(a.dono, a.groupId, { role: 'MEMBER', label: 'Velho' });
      await invites.revoke(a.dono, a.groupId, revogado.invite.id);

      const entrou = new Date(Date.now() - 5 * DIA);
      for (let i = 0; i < 12; i += 1) {
        const m = await membro(a.groupId, `Recepção ${i}`, { statsOptIn: true, joinedAt: entrou });
        await prisma.groupMembership.update({
          where: { id: m.membershipId },
          data: { joinedViaInviteId: recepcao.invite.id },
        });
        if (i < 7) await treinou(m.userId, new Date(entrou.getTime() + 3_600_000 * 30));
      }
      for (let i = 0; i < 2; i += 1) {
        const m = await membro(a.groupId, `Indicada ${i}`, { joinedAt: entrou });
        await prisma.groupMembership.update({
          where: { id: m.membershipId },
          data: { joinedViaInviteId: poucos.invite.id },
        });
      }

      const v = await invites.overview(a.dono, a.groupId);
      const linha = (id: string) => v.invites.find((i) => i.id === id)!;
      // A linha não traz ativação (revisão #401: a diferença entre linhas e o
      // cartão isolaria quem entrou por um convite pequeno).
      expect(linha(recepcao.invite.id)).toMatchObject({ joined: 12, status: 'active' });
      expect(linha(recepcao.invite.id)).not.toHaveProperty('activated');
      expect(linha(poucos.invite.id)).toMatchObject({ joined: null });
      expect(linha(revogado.invite.id).status).toBe('revoked');
      expect(v.cards.activeLinks).toBe(2);
      expect(v.cards.joinedLast30Days).toBe(14);
      expect(v.cards.activated48h).toEqual({ percent: 58 });
      // Nenhum e-mail sem aceite: zero aparece (balde vazio não esconde ninguém).
      expect(v.cards.notAccepted).toBe(0);
    });

    it('o profissional não vê convite de equipe, nem a comunidade de outro dono', async () => {
      const a = await comunidade();
      const b = await comunidade();
      const prof = await membro(a.groupId, 'Prof', { role: 'PROFESSIONAL' });
      await invites.create(a.dono, a.groupId, { role: 'PROFESSIONAL', email: 'eq@t.local' });
      const v = await invites.overview(prof.userId, a.groupId);
      expect(v.invites.map((i) => i.email)).not.toContain('eq@t.local');
      await expect(invites.overview(b.dono, a.groupId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('membros: entrou por, acompanha e ações em massa (Pn-04)', () => {
    it('a lista mostra por onde entrou e quem acompanha; quem saiu só com o pedido', async () => {
      const a = await comunidade();
      const helena = await membro(a.groupId, 'Helena', { role: 'PROFESSIONAL' });
      const link = await invites.create(a.dono, a.groupId, {
        role: 'MEMBER',
        label: 'QR · recepção',
        origin: 'QR',
        accompaniedByMembershipId: helena.membershipId,
      });
      const ana = await pessoa('Ana Lista');
      await invites.accept(ana.id, tokenDe(link.url), semConsentimento);
      const saiu = await membro(a.groupId, 'Elisa Saiu');
      await memberships.leave(saiu.userId, a.groupId);

      const lista = await memberships.listMembers(a.dono, a.groupId);
      const linhaAna = lista.find((m) => m.name === 'Ana Lista')!;
      expect(linhaAna.joinedVia).toEqual({
        inviteId: link.invite.id,
        label: 'QR · recepção',
        origin: 'QR',
        via: 'INVITE',
      });
      expect(linhaAna.accompaniedBy).toEqual({ membershipId: helena.membershipId, name: 'Helena' });
      expect(lista.find((m) => m.name === 'Elisa Saiu')).toBeUndefined();

      const comSaida = await memberships.listMembers(a.dono, a.groupId, { includeLeft: true });
      expect(comSaida.find((m) => m.name === 'Elisa Saiu')).toMatchObject({ status: 'LEFT' });
    });

    it('trocar responsável: só profissional ativo da comunidade; o id é amarrado à URL', async () => {
      const a = await comunidade();
      const b = await comunidade();
      const helena = await membro(a.groupId, 'Helena', { role: 'PROFESSIONAL' });
      const ana = await membro(a.groupId, 'Ana');
      const bea = await membro(b.groupId, 'Bea de B');
      const profB = await membro(b.groupId, 'Prof B', { role: 'PROFESSIONAL' });

      await admin.setAccompaniedBy(a.dono, a.groupId, ana.membershipId, helena.membershipId);
      expect(
        (await prisma.groupMembership.findUniqueOrThrow({ where: { id: ana.membershipId } }))
          .accompaniedById,
      ).toBe(helena.membershipId);

      await expect(
        admin.setAccompaniedBy(a.dono, a.groupId, bea.membershipId, helena.membershipId),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        admin.setAccompaniedBy(a.dono, a.groupId, ana.membershipId, profB.membershipId),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        admin.setAccompaniedBy(helena.userId, a.groupId, ana.membershipId, null),
      ).rejects.toBeInstanceOf(ForbiddenException);

      await admin.setAccompaniedBy(a.dono, a.groupId, ana.membershipId, null);
      expect(
        (await prisma.groupMembership.findUniqueOrThrow({ where: { id: ana.membershipId } }))
          .accompaniedById,
      ).toBeNull();
    });

    it('em massa: troca o responsável de todos, grava a trilha, e recusa o lote com id de fora', async () => {
      const a = await comunidade();
      const b = await comunidade();
      const helena = await membro(a.groupId, 'Helena', { role: 'PROFESSIONAL' });
      const ids = [];
      for (let i = 0; i < 3; i += 1) ids.push((await membro(a.groupId, `M${i}`)).membershipId);
      const deB = await membro(b.groupId, 'Fora');

      await expect(
        admin.bulk(a.dono, a.groupId, {
          action: 'accompany',
          membershipIds: [...ids, deB.membershipId],
          accompaniedByMembershipId: helena.membershipId,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(
        await prisma.groupMembership.count({ where: { accompaniedById: helena.membershipId } }),
      ).toBe(0);

      const r = await admin.bulk(a.dono, a.groupId, {
        action: 'accompany',
        membershipIds: ids,
        accompaniedByMembershipId: helena.membershipId,
      });
      expect(r.updated).toBe(3);
      const trilha = await prisma.groupAuditLog.findMany({ where: { groupId: a.groupId } });
      expect(trilha).toHaveLength(1);
      expect(trilha[0]).toMatchObject({
        action: 'members.accompany',
        targetCount: 3,
        actorId: a.dono,
      });
    });

    it('dar assento em massa: sem vaga para todos, ninguém ganha e a resposta diz quantos faltam', async () => {
      const a = await comunidade();
      await prisma.groupSeatPool.create({
        data: { groupId: a.groupId, seats: 2, unitPriceCents: 1490, status: 'ACTIVE' },
      });
      const ids = [];
      for (let i = 0; i < 3; i += 1) ids.push((await membro(a.groupId, `S${i}`)).membershipId);
      const erro = await admin
        .bulk(a.dono, a.groupId, { action: 'seat', membershipIds: ids })
        .catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ConflictException);
      expect((erro as HttpException).getResponse()).toMatchObject({ code: 'NO_SEATS', missing: 1 });
      expect(
        await prisma.groupSeatAssignment.count({ where: { pool: { groupId: a.groupId } } }),
      ).toBe(0);

      const ok = await admin.bulk(a.dono, a.groupId, {
        action: 'seat',
        membershipIds: ids.slice(0, 2),
      });
      expect(ok.updated).toBe(2);
    });

    it('lote grande demais é recusado', async () => {
      const a = await comunidade();
      await expect(
        admin.bulk(a.dono, a.groupId, {
          action: 'unseat',
          membershipIds: Array.from({ length: 101 }, (_, i) => `id-${i}`),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('quando o profissional sai, quem ele acompanhava fica sem responsável', async () => {
      const a = await comunidade();
      const helena = await membro(a.groupId, 'Helena', { role: 'PROFESSIONAL' });
      const ana = await membro(a.groupId, 'Ana');
      await admin.setAccompaniedBy(a.dono, a.groupId, ana.membershipId, helena.membershipId);
      await memberships.leave(helena.userId, a.groupId);
      expect(
        (await prisma.groupMembership.findUniqueOrThrow({ where: { id: ana.membershipId } }))
          .accompaniedById,
      ).toBeNull();
    });
  });

  describe('retenção do e-mail do convidado', () => {
    it('convite recusado perde o e-mail 30 dias depois da recusa', async () => {
      const a = await comunidade();
      const c = await invites.create(a.dono, a.groupId, { role: 'MEMBER', email: 'rec@t.local' });
      await prisma.groupInvite.update({
        where: { id: c.invite.id },
        data: { declinedAt: new Date(Date.now() - 31 * DIA) },
      });
      await invites.purgeOldEmails(new Date());
      expect(
        (await prisma.groupInvite.findUniqueOrThrow({ where: { id: c.invite.id } })).email,
      ).toBeNull();
    });
  });
});
