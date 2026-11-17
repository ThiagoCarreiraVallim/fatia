import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JoinPolicy } from '@fatia/db';
import { PrismaService } from '../../common/prisma.service';
import type { EmailService } from '../../notifications/email.service';
import { silentNotifications } from '../../notifications/__tests__/silent-notifications';
import { GroupService } from '../group.service';
import { InviteService } from '../invite.service';
import { MembershipService } from '../membership.service';
import { ProfessionalLinkService } from '../professional-link.service';

/**
 * Entrar com código (#393, Cm-02): o código legível da recepção é um convite
 * revogável, mas **não** é aprovação — segue a `joinPolicy`. Código inválido,
 * vencido, revogado ou de comunidade só por convite responde igual, sem dizer
 * se a comunidade existe.
 */
describe('código de entrada (integração)', () => {
  const prisma = new PrismaService();
  const links = new ProfessionalLinkService(prisma);
  const memberships = new MembershipService(prisma, links, silentNotifications);
  const email = { send: async () => true } as unknown as EmailService;
  const config = { get: () => 'https://fatia.test/' } as unknown as ConfigService;
  const invites = new InviteService(prisma, memberships, email, config, silentNotifications);
  const groups = new GroupService(prisma, links, []);

  const stamp = `entrada-${Date.now()}`;
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

  async function comunidade(joinPolicy: JoinPolicy = 'APPROVAL') {
    const dono = await pessoa('Dona');
    const grupo = await groups.create(dono, { type: 'SPONSORED', name: 'Academia', joinPolicy });
    grupos.push(grupo.id);
    return { dono, grupo };
  }

  const semConsentimento = { scopes: [], statsOptIn: false };

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  it('o dono gera um código legível; o código mostra a comunidade e a forma de entrada', async () => {
    const { dono, grupo } = await comunidade('APPROVAL');
    const { invite, url } = await invites.create(dono, grupo.id, { role: 'MEMBER', code: true });
    expect(invite.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(url).toBe(`https://fatia.test/community?join=1&code=${invite.code}`);

    // Digitado com minúsculas, espaço ou hífen, acha do mesmo jeito.
    const digitado = `${invite.code!.slice(0, 4).toLowerCase()}-${invite.code!.slice(4)} `;
    const cartao = await groups.previewByCode(digitado);
    expect(cartao).toMatchObject({
      id: grupo.id,
      name: 'Academia',
      joinPolicy: 'APPROVAL',
      code: invite.code,
      proOffer: false,
    });
  });

  it('com aprovação, entrar pelo código vira pedido; o uso do código é contado', async () => {
    const { dono, grupo } = await comunidade('APPROVAL');
    const { invite } = await invites.create(dono, grupo.id, { role: 'MEMBER', code: true });
    const aluna = await pessoa('Aluna');
    const r = await memberships.requestJoin(aluna, invite.code!, semConsentimento);
    expect(r).toMatchObject({ status: 'INVITED', role: 'MEMBER', groupId: grupo.id });
    expect((await prisma.groupInvite.findUniqueOrThrow({ where: { id: invite.id } })).uses).toBe(1);
  });

  it('com entrada aberta, o código põe a pessoa dentro na hora', async () => {
    const { dono, grupo } = await comunidade('OPEN');
    const { invite } = await invites.create(dono, grupo.id, { role: 'MEMBER', code: true });
    const aluno = await pessoa('Aluno');
    const r = await memberships.requestJoin(aluno, invite.code!.toLowerCase(), {
      scopes: ['WORKOUT'],
      statsOptIn: false,
    });
    expect(r).toMatchObject({ status: 'ACTIVE', role: 'MEMBER', groupId: grupo.id });
  });

  it('código revogado ou vencido responde como código que não existe', async () => {
    const { dono, grupo } = await comunidade('OPEN');
    const revogado = await invites.create(dono, grupo.id, { role: 'MEMBER', code: true });
    await invites.revoke(dono, grupo.id, revogado.invite.id);
    const vencido = await invites.create(dono, grupo.id, { role: 'MEMBER', code: true });
    await prisma.groupInvite.update({
      where: { id: vencido.invite.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const aluno = await pessoa('Aluno');
    for (const code of [revogado.invite.code!, vencido.invite.code!, 'ZZZZZZZZ']) {
      await expect(groups.previewByCode(code)).rejects.toThrow(NotFoundException);
      await expect(memberships.requestJoin(aluno, code, semConsentimento)).rejects.toThrow(
        NotFoundException,
      );
    }
  });

  it('comunidade só por convite não gera código, e o slug dela não abre a porta', async () => {
    const { dono, grupo } = await comunidade('INVITE_ONLY');
    await expect(invites.create(dono, grupo.id, { role: 'MEMBER', code: true })).rejects.toThrow(
      ConflictException,
    );
    await expect(groups.previewByCode(grupo.slug)).rejects.toThrow(NotFoundException);
  });

  it('código é só de membro: não sai código de equipe', async () => {
    const { dono, grupo } = await comunidade('OPEN');
    await expect(
      invites.create(dono, grupo.id, { role: 'PROFESSIONAL', code: true }),
    ).rejects.toThrow(ConflictException);
  });

  it('o código não serve como token de link (que seria aprovação)', async () => {
    const { dono, grupo } = await comunidade('APPROVAL');
    const { invite } = await invites.create(dono, grupo.id, { role: 'MEMBER', code: true });
    const aluna = await pessoa('Aluna');
    await expect(invites.accept(aluna, invite.code!, semConsentimento)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('o slug continua valendo como código', async () => {
    const { grupo } = await comunidade('OPEN');
    const cartao = await groups.previewByCode(grupo.slug.toUpperCase());
    expect(cartao).toMatchObject({ id: grupo.id, code: grupo.slug });
  });

  describe('aviso de PRO liberado', () => {
    it('só aparece quando a comunidade tem assento livre (ou dá a todos)', async () => {
      const { dono, grupo } = await comunidade('OPEN');
      expect((await groups.previewByCode(grupo.slug)).proOffer).toBe(false);

      const pool = await prisma.groupSeatPool.create({
        data: { groupId: grupo.id, seats: 1, unitPriceCents: 1490, status: 'ACTIVE' },
      });
      expect((await groups.previewByCode(grupo.slug)).proOffer).toBe(true);

      // O único assento ocupado: sem aviso.
      const aluna = await pessoa('Aluna');
      const m = await memberships.requestJoin(aluna, grupo.slug, semConsentimento);
      await prisma.groupSeatAssignment.create({
        data: { poolId: pool.id, membershipId: m.membershipId },
      });
      expect((await groups.previewByCode(grupo.slug)).proOffer).toBe(false);

      // Todos os membros: sempre.
      await prisma.groupSeatPool.update({ where: { id: pool.id }, data: { mode: 'ALL_MEMBERS' } });
      expect((await groups.previewByCode(grupo.slug)).proOffer).toBe(true);

      // Pool cancelado não oferece nada.
      await prisma.groupSeatPool.update({
        where: { id: pool.id },
        data: { status: 'CANCELED', currentPeriodEnd: new Date(Date.now() - 86_400_000) },
      });
      expect((await groups.previewByCode(grupo.slug)).proOffer).toBe(false);
      void dono;
    });
  });
});
