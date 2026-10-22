import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import type { EmailMessage, EmailService } from '../../notifications/email.service';
import { GroupService } from '../group.service';
import { INVITE_MAX_PER_DAY, InviteService } from '../invite.service';
import { MembershipService } from '../membership.service';
import { ProfessionalAccessService } from '../professional-access.service';
import { ProfessionalLinkService } from '../professional-link.service';
import { AccessAuditService } from '../access-audit.service';
import { silentNotifications } from '../../notifications/__tests__/silent-notifications';

/**
 * O que o painel da equipe (Fase 6) faz no Postgres real: a lista de membros
 * vista pela equipe, mudar papel com os vínculos acompanhando, e o convite em
 * lote dentro do teto diário.
 */
describe('painel da comunidade (integração)', () => {
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
  const config = { get: () => 'https://fatia.test/' } as unknown as ConfigService;
  const invites = new InviteService(prisma, memberships, email, config, silentNotifications);
  const groups = new GroupService(prisma, links, []);
  const acesso = new ProfessionalAccessService(prisma, new AccessAuditService(prisma));

  const stamp = `painel-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;

  async function pessoa(nome: string) {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: nome },
    });
    criados.push(user.id);
    return user.id;
  }

  async function comunidade() {
    const dono = await pessoa('Dona');
    const grupo = await groups.create(dono, {
      type: 'SPONSORED',
      name: 'Academia',
      joinPolicy: 'OPEN',
    });
    grupos.push(grupo.id);
    return { dono, grupo };
  }

  async function membro(groupId: string, nome: string, scopes: ('WORKOUT' | 'HABITS')[] = []) {
    const id = await pessoa(nome);
    const slug = (await prisma.group.findUniqueOrThrow({ where: { id: groupId } })).slug;
    const r = await memberships.requestJoin(id, slug, { scopes, statsOptIn: false });
    return { userId: id, membershipId: r.membershipId };
  }

  const vivosPara = (groupId: string, professionalId: string) =>
    prisma.professionalLink.findMany({
      where: { groupId, professionalId, revokedAt: null },
      select: { subjectUserId: true, scopes: true },
    });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  describe('lista de membros vista pela equipe', () => {
    it('o dono vê o que cada um compartilha com ele e quem tem assento', async () => {
      const { dono, grupo } = await comunidade();
      const ana = await membro(grupo.id, 'Ana', ['WORKOUT']);
      await membro(grupo.id, 'Bia');
      const pool = await prisma.groupSeatPool.create({
        data: { groupId: grupo.id, seats: 1, unitPriceCents: 1490, status: 'ACTIVE' },
      });
      await prisma.groupSeatAssignment.create({
        data: { poolId: pool.id, membershipId: ana.membershipId },
      });

      const lista = await memberships.listMembers(dono, grupo.id);
      const porNome = Object.fromEntries(lista.map((m) => [m.name, m]));
      expect(porNome.Ana).toMatchObject({ scopesGrantedToMe: ['WORKOUT'], hasAiSeat: true });
      expect(porNome.Bia).toMatchObject({ scopesGrantedToMe: [], hasAiSeat: false });
      // A participação individual nas estatísticas não sai para ninguém.
      expect(JSON.stringify(lista)).not.toContain('statsOptIn');
    });

    it('assento de pool cancelado ou vencido não conta, igual ao portão da IA', async () => {
      // `cancel` e a expiração não revogam as atribuições: o pool é que deixa de
      // valer. O portão (`aiTierForUser`) já lia FREE nesse caso; a lista dizia
      // que a pessoa ainda tinha IA paga pela comunidade.
      const ontem = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const casos = [
        { nome: 'cortesia cancelada', pool: { status: 'CANCELED' as const } },
        {
          nome: 'pago, cancelado e vencido',
          pool: {
            status: 'ACTIVE' as const,
            cancelAtPeriodEnd: true,
            currentPeriodEnd: ontem,
            graceEndsAt: null,
          },
        },
      ];
      for (const caso of casos) {
        const { dono, grupo } = await comunidade();
        const ana = await membro(grupo.id, 'Ana');
        const pool = await prisma.groupSeatPool.create({
          data: { groupId: grupo.id, seats: 1, unitPriceCents: 1490, ...caso.pool },
        });
        await prisma.groupSeatAssignment.create({
          data: { poolId: pool.id, membershipId: ana.membershipId },
        });

        const lista = await memberships.listMembers(dono, grupo.id);
        expect({ caso: caso.nome, seat: lista.find((m) => m.name === 'Ana')?.hasAiSeat }).toEqual({
          caso: caso.nome,
          seat: false,
        });
        const daAna = await groups.findByIdForMember(ana.userId, grupo.id);
        expect({ caso: caso.nome, seat: daAna.hasAiSeat }).toEqual({
          caso: caso.nome,
          seat: false,
        });
        expect((await groups.listMine(ana.userId))[0].hasAiSeat).toBe(false);
      }
    });

    it('assento de pool ativo aparece na lista da própria pessoa', async () => {
      const { grupo } = await comunidade();
      const ana = await membro(grupo.id, 'Ana');
      const pool = await prisma.groupSeatPool.create({
        data: { groupId: grupo.id, seats: 1, unitPriceCents: 1490, status: 'ACTIVE' },
      });
      await prisma.groupSeatAssignment.create({
        data: { poolId: pool.id, membershipId: ana.membershipId },
      });

      expect((await groups.findByIdForMember(ana.userId, grupo.id)).hasAiSeat).toBe(true);
    });

    it('membro comum não recebe escopo nem assento de ninguém', async () => {
      const { grupo } = await comunidade();
      const ana = await membro(grupo.id, 'Ana', ['WORKOUT']);
      const lista = await memberships.listMembers(ana.userId, grupo.id);
      for (const m of lista) {
        expect(m).not.toHaveProperty('scopesGrantedToMe');
        expect(m).not.toHaveProperty('hasAiSeat');
      }
    });
  });

  describe('mudar papel', () => {
    it('quem vira profissional passa a receber o que os membros consentiram, e perde ao voltar', async () => {
      const { dono, grupo } = await comunidade();
      const ana = await membro(grupo.id, 'Ana', ['WORKOUT', 'HABITS']);
      const caio = await membro(grupo.id, 'Caio');

      await memberships.changeRole(dono, grupo.id, caio.membershipId, 'PROFESSIONAL');
      expect(await vivosPara(grupo.id, caio.userId)).toEqual([
        { subjectUserId: ana.userId, scopes: ['WORKOUT', 'HABITS'] },
      ]);
      await expect(
        acesso.assertReadable(caio.userId, ana.membershipId, 'WORKOUT', 'test'),
      ).resolves.toBeDefined();

      // Entre papéis de equipe nada muda nos vínculos.
      await memberships.changeRole(dono, grupo.id, caio.membershipId, 'CREATOR');
      expect(await vivosPara(grupo.id, caio.userId)).toHaveLength(1);

      const r = await memberships.changeRole(dono, grupo.id, caio.membershipId, 'MEMBER');
      expect(r).toMatchObject({ role: 'MEMBER', revokedLinks: 1 });
      expect(await vivosPara(grupo.id, caio.userId)).toEqual([]);
      await expect(
        acesso.assertReadable(caio.userId, ana.membershipId, 'WORKOUT', 'test'),
      ).rejects.toBeInstanceOf(NotFoundException);
      // O que o próprio Caio compartilha com a equipe continua como estava.
      const revogado = await prisma.professionalLink.findFirstOrThrow({
        where: { groupId: grupo.id, professionalId: caio.userId },
      });
      expect(revogado.revokedReason).toBe('role_changed');
    });

    it('membership de outra comunidade é 404, mesmo sendo dono desta (#204)', async () => {
      const a = await comunidade();
      const b = await comunidade();
      const deB = await membro(b.grupo.id, 'Bia');
      await expect(
        memberships.changeRole(a.dono, a.grupo.id, deB.membershipId, 'PROFESSIONAL'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(
        (await prisma.groupMembership.findUniqueOrThrow({ where: { id: deB.membershipId } })).role,
      ).toBe('MEMBER');
    });

    it('dono não muda de papel por aqui; pedido pendente também não', async () => {
      const { dono, grupo } = await comunidade();
      const minha = await prisma.groupMembership.findUniqueOrThrow({
        where: { groupId_userId: { groupId: grupo.id, userId: dono } },
      });
      await expect(
        memberships.changeRole(dono, grupo.id, minha.id, 'PROFESSIONAL'),
      ).rejects.toBeInstanceOf(ConflictException);

      await prisma.group.update({ where: { id: grupo.id }, data: { joinPolicy: 'APPROVAL' } });
      const pendente = await membro(grupo.id, 'Pendente');
      await expect(
        memberships.changeRole(dono, grupo.id, pendente.membershipId, 'PROFESSIONAL'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('profissional não muda papel de ninguém', async () => {
      const { dono, grupo } = await comunidade();
      const pro = await membro(grupo.id, 'Pro');
      await memberships.changeRole(dono, grupo.id, pro.membershipId, 'PROFESSIONAL');
      const ana = await membro(grupo.id, 'Ana');
      await expect(
        memberships.changeRole(pro.userId, grupo.id, ana.membershipId, 'PROFESSIONAL'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('convite em lote', () => {
    it('cria um por e-mail válido e diz por que pulou os outros', async () => {
      const { dono, grupo } = await comunidade();
      const dentro = await membro(grupo.id, 'Ana');
      const emailDentro = (await prisma.user.findUniqueOrThrow({ where: { id: dentro.userId } }))
        .email;
      await invites.create(dono, grupo.id, { role: 'MEMBER', email: 'aberto@x.com' });
      enviados.length = 0;

      const r = await invites.createBatch(dono, grupo.id, {
        role: 'MEMBER',
        emails: ['Nova@X.com', 'nova@x.com', 'ruim', emailDentro, 'aberto@x.com', 'outra@x.com'],
      });

      expect(r.created.map((c) => c.email)).toEqual(['nova@x.com', 'outra@x.com']);
      expect(r.skipped).toEqual([
        { email: 'nova@x.com', reason: 'duplicate' },
        { email: 'ruim', reason: 'invalid' },
        { email: emailDentro, reason: 'member' },
        { email: 'aberto@x.com', reason: 'pending_invite' },
      ]);
      expect(enviados.map((m) => m.to)).toEqual(['nova@x.com', 'outra@x.com']);
    });

    it('o lote inteiro conta no teto do dia: passou, nada é criado', async () => {
      const { dono, grupo } = await comunidade();
      await prisma.groupInvite.createMany({
        data: Array.from({ length: INVITE_MAX_PER_DAY - 1 }, (_, i) => ({
          groupId: grupo.id,
          tokenHash: `${stamp}-teto-${i}`,
          role: 'MEMBER' as const,
          expiresAt: new Date(Date.now() + 86_400_000),
        })),
      });
      const antes = await prisma.groupInvite.count({ where: { groupId: grupo.id } });

      await expect(
        invites.createBatch(dono, grupo.id, { role: 'MEMBER', emails: ['a@x.com', 'b@x.com'] }),
      ).rejects.toMatchObject({ status: 429 });
      expect(await prisma.groupInvite.count({ where: { groupId: grupo.id } })).toBe(antes);
    });

    it('profissional convida em lote só como membro', async () => {
      const { dono, grupo } = await comunidade();
      const pro = await membro(grupo.id, 'Pro');
      await memberships.changeRole(dono, grupo.id, pro.membershipId, 'PROFESSIONAL');
      await expect(
        invites.createBatch(pro.userId, grupo.id, { role: 'PROFESSIONAL', emails: ['a@x.com'] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('convites da equipe', () => {
    it('profissional não revoga nem reenvia convite de equipe feito pelo dono', async () => {
      const { dono, grupo } = await comunidade();
      const pro = await membro(grupo.id, 'Pro');
      await memberships.changeRole(dono, grupo.id, pro.membershipId, 'PROFESSIONAL');
      const { invite } = await invites.create(dono, grupo.id, {
        role: 'PROFESSIONAL',
        email: 'colega@x.com',
      });
      await expect(invites.revoke(pro.userId, grupo.id, invite.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(invites.resend(pro.userId, grupo.id, invite.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(
        (await prisma.groupInvite.findUniqueOrThrow({ where: { id: invite.id } })).revokedAt,
      ).toBeNull();
    });
  });
});
