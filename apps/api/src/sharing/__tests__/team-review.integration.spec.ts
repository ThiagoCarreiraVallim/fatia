import type { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { GroupRole, GroupType, MembershipStatus, ShareScope } from '@fatia/db';
import { SeatPoolService } from '../../billing/seat-pool.service';
import { PrismaService } from '../../common/prisma.service';
import { silentNotifications } from '../../notifications/__tests__/silent-notifications';
import { AccessAuditService } from '../access-audit.service';
import { ConsentService } from '../consent.service';
import { GroupService } from '../group.service';
import { InviteService } from '../invite.service';
import { MembershipService } from '../membership.service';
import { ProfessionalAccessService } from '../professional-access.service';
import { ProfessionalLinkService } from '../professional-link.service';
import { ReviewService } from '../review.service';
import { TeamService } from '../team.service';

/**
 * Os defeitos da revisão adversarial da #404, contra Postgres real: vínculo
 * ressuscitado na troca de especialidade, especialidade que sobrevive à saída,
 * admin abrindo dado de aluno por conta alternativa, convite de equipe órfão,
 * limite do em risco, trilha e desbanir.
 */
const ADMIN = GroupRole.ADMIN;
const TODAS = Object.values(ShareScope);

describe('equipe (#404): revisão adversarial', () => {
  const prisma = new PrismaService();
  const links = new ProfessionalLinkService(prisma);
  const access = new ProfessionalAccessService(prisma, new AccessAuditService(prisma));
  const memberships = new MembershipService(prisma, links, silentNotifications);
  const groups = new GroupService(prisma, links);
  const team = new TeamService(prisma, links);
  const consent = new ConsentService(prisma, links);
  const config = { get: () => undefined } as unknown as ConfigService;
  const seats = new SeatPoolService(prisma, config, null);
  const invites = new InviteService(
    prisma,
    memberships,
    { send: async () => true } as never,
    config,
    silentNotifications,
    seats,
  );
  const review = new ReviewService(prisma, access, null as never, silentNotifications as never);

  const stamp = `r404-${Date.now()}`;
  const usuarios: string[] = [];
  const grupos: string[] = [];

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

  /** Dono, um profissional e uma aluna que compartilhou tudo com os dois. */
  async function cenario(tag: string) {
    const dono = await pessoa(`Dono ${tag}`);
    const pro = await pessoa(`Pro ${tag}`);
    const aluna = await pessoa(`Aluna ${tag}`);
    const g = await prisma.group.create({
      data: {
        type: GroupType.SPONSORED,
        name: `G ${tag}`,
        slug: `${stamp}-${tag}`,
        ownerId: dono,
        memberships: {
          create: [
            { userId: dono, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
            { userId: pro, role: GroupRole.PROFESSIONAL, status: MembershipStatus.ACTIVE },
            {
              userId: aluna,
              role: GroupRole.MEMBER,
              status: MembershipStatus.ACTIVE,
              consentScopes: TODAS,
            },
          ],
        },
      },
      include: { memberships: true },
    });
    grupos.push(g.id);
    await prisma.professionalLink.createMany({
      data: [dono, pro].map((professionalId) => ({
        subjectUserId: aluna,
        professionalId,
        groupId: g.id,
        scopes: TODAS,
      })),
    });
    const mid = (u: string) => g.memberships.find((x) => x.userId === u)!.id;
    return { grupo: g.id, dono, pro, aluna, mPro: mid(pro), mAluna: mid(aluna) };
  }

  function tokenDe(url: string) {
    return new URL(url).pathname.replace(/^\/c\//, '');
  }

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.$disconnect();
  });

  afterEach(() => jest.restoreAllMocks());

  it('A1: setSpecialty não ressuscita vínculo que a aluna revogou no meio (TOCTOU)', async () => {
    const c = await cenario('a1');
    const vivo = await prisma.professionalLink.findFirstOrThrow({
      where: { subjectUserId: c.aluna, professionalId: c.pro, revokedAt: null },
    });
    // Intercala a revogação da aluna entre a leitura dos vínculos e o $transaction.
    const original = links.narrowReceiverOps.bind(links);
    jest.spyOn(links, 'narrowReceiverOps').mockImplementation(async (...args) => {
      const r = await original(...args);
      await consent.revoke(c.aluna, vivo.id);
      return r;
    });
    await team.setSpecialty(c.dono, c.grupo, c.mPro, 'NUTRITION');

    const vivos = await prisma.professionalLink.findMany({
      where: { subjectUserId: c.aluna, professionalId: c.pro, revokedAt: null },
    });
    // A aluna revogou: não pode haver vínculo vivo dela com o profissional.
    expect(vivos).toEqual([]);
    await expect(
      access.assertReadable(c.pro, c.mAluna, ShareScope.NUTRITION, 'r404'),
    ).rejects.toThrow();
  });

  it('A2: quem era nutricionista, sai e volta como profissional não recebe treino', async () => {
    const c = await cenario('a2');
    await team.setSpecialty(c.dono, c.grupo, c.mPro, 'NUTRITION');
    await memberships.leave(c.pro, c.grupo);
    const conv = await invites.create(c.dono, c.grupo, {
      role: GroupRole.PROFESSIONAL,
      maxUses: 1,
      expiresInDays: 7,
    });
    await invites.accept(c.pro, tokenDe(conv.url), { scopes: [], statsOptIn: false });

    const m = await prisma.groupMembership.findUniqueOrThrow({ where: { id: c.mPro } });
    const vivos = await prisma.professionalLink.findMany({
      where: { subjectUserId: c.aluna, professionalId: c.pro, revokedAt: null },
    });
    // Quem volta é profissional novo: sem a especialidade de antes, e com o
    // vínculo coerente com ela (o leque inverso, sem recorte).
    expect(m.specialty).toBeNull();
    expect(vivos).toHaveLength(1);
    // A especialidade só existe em quem é profissional, no próprio banco.
    await expect(
      prisma.groupMembership.update({
        where: { id: c.mAluna },
        data: { specialty: 'NUTRITION' },
      }),
    ).rejects.toThrow();
  });

  it('A2b: sair zera a especialidade na hora, e o dono vê na trilha', async () => {
    const c = await cenario('a2b');
    await team.setSpecialty(c.dono, c.grupo, c.mPro, 'NUTRITION');
    await memberships.removeMember(c.dono, c.grupo, c.mPro);
    const m = await prisma.groupMembership.findUniqueOrThrow({ where: { id: c.mPro } });
    expect(m.specialty).toBeNull();
    const zerou = await prisma.groupAuditLog.findMany({
      where: { groupId: c.grupo, action: 'members.specialty' },
      orderBy: { createdAt: 'asc' },
    });
    expect(zerou.map((z) => (z.payload as { to: unknown }).to)).toEqual(['NUTRITION', null]);
  });

  it('A3: admin não concede papel que recebe vínculo nem muda o que é obrigatório compartilhar', async () => {
    const c = await cenario('a3');
    const admin = await pessoa('Admin a3');
    await prisma.groupMembership.create({
      data: { groupId: c.grupo, userId: admin, role: ADMIN, status: MembershipStatus.ACTIVE },
    });
    // Convite (link ou e-mail) de profissional ou criador: só o dono.
    for (const role of [GroupRole.PROFESSIONAL, GroupRole.CREATOR]) {
      await expect(
        invites.create(admin, c.grupo, { role, maxUses: 1, expiresInDays: 7 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
    // Aprovar como profissional e promover a criador: também não.
    const alt = await pessoa('Conta alternativa do admin');
    const pedido = await prisma.groupMembership.create({
      data: { groupId: c.grupo, userId: alt, role: GroupRole.MEMBER },
    });
    await expect(
      memberships.approve(admin, c.grupo, pedido.id, GroupRole.PROFESSIONAL),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await memberships.approve(admin, c.grupo, pedido.id, GroupRole.MEMBER);
    await expect(
      memberships.changeRole(admin, c.grupo, pedido.id, GroupRole.CREATOR),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      access.assertReadable(alt, c.mAluna, ShareScope.WORKOUT, 'r404'),
    ).rejects.toThrow();
    // Recepção e membro continuam com ele.
    await memberships.changeRole(admin, c.grupo, pedido.id, GroupRole.RECEPTION);
    await invites.create(admin, c.grupo, {
      role: GroupRole.RECEPTION,
      maxUses: 1,
      expiresInDays: 7,
    });
    // O que todo membro tem de compartilhar é do dono.
    await expect(
      groups.update(admin, c.grupo, { requiredSharingScopes: [ShareScope.WORKOUT] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await groups.update(c.dono, c.grupo, { requiredSharingScopes: [ShareScope.WORKOUT] });
  });

  it('A4: convite de equipe sai junto com quem o criou, ou com o papel que o permitia', async () => {
    const c = await cenario('a4');
    const admin = await pessoa('Admin a4');
    const mAdmin = await prisma.groupMembership.create({
      data: { groupId: c.grupo, userId: admin, role: ADMIN, status: MembershipStatus.ACTIVE },
    });
    const deEquipe = await invites.create(admin, c.grupo, {
      role: GroupRole.RECEPTION,
      maxUses: 1,
      expiresInDays: 7,
    });
    const deMembro = await invites.create(admin, c.grupo, {
      role: GroupRole.MEMBER,
      maxUses: 5,
      expiresInDays: 7,
    });
    // Rebaixado a membro: o convite de equipe que ele criou cai na hora.
    await memberships.changeRole(c.dono, c.grupo, mAdmin.id, GroupRole.MEMBER);
    const novo = await pessoa('Novo a4');
    await expect(
      invites.accept(novo, tokenDe(deEquipe.url), { scopes: [], statsOptIn: false }),
    ).rejects.toThrow();
    // O de membro continua: entrar como membro não dá nada a ninguém.
    await invites.accept(novo, tokenDe(deMembro.url), { scopes: [], statsOptIn: false });

    // E quem sai leva os convites de equipe dele.
    const conv = await invites.create(c.dono, c.grupo, {
      role: GroupRole.CREATOR,
      maxUses: 1,
      expiresInDays: 7,
    });
    await prisma.groupInvite.update({
      where: { id: conv.invite.id },
      data: { createdById: c.pro },
    });
    await memberships.leave(c.pro, c.grupo);
    const outro = await pessoa('Outro a4');
    await expect(
      invites.accept(outro, tokenDe(conv.url), { scopes: [], statsOptIn: false }),
    ).rejects.toThrow();
  });

  it('A5: admin muda o limite do em risco, que ele não vê', async () => {
    const c = await cenario('a5');
    const admin = await pessoa('Admin a5');
    await prisma.groupMembership.create({
      data: { groupId: c.grupo, userId: admin, role: ADMIN, status: MembershipStatus.ACTIVE },
    });
    await expect(review.atRisk(admin, c.grupo)).rejects.toThrow();
    await expect(review.setRiskDays(admin, c.grupo, 30)).rejects.toThrow();
  });

  it('A6: aprovar com papel, passar a posse e o "só quem acompanham" deixam linha', async () => {
    const c = await cenario('a6');
    const novo = await pessoa('Pedido a6');
    const pedido = await prisma.groupMembership.create({
      data: { groupId: c.grupo, userId: novo, role: GroupRole.MEMBER },
    });
    await memberships.approve(c.dono, c.grupo, pedido.id, GroupRole.PROFESSIONAL);
    await groups.update(c.dono, c.grupo, { proSeeOnlyAssigned: true });
    await team.setSpecialty(c.dono, c.grupo, c.mPro, 'NUTRITION');
    await groups.transferOwnership(c.dono, c.grupo, c.mPro);
    const trilha = await prisma.groupAuditLog.findMany({
      where: { groupId: c.grupo },
      orderBy: { createdAt: 'asc' },
    });
    const linhas = trilha.map((t) => [t.action, t.actorId, t.payload]);
    expect(linhas).toEqual(
      expect.arrayContaining([
        [
          'members.approve',
          c.dono,
          expect.objectContaining({ membershipIds: [pedido.id], to: 'PROFESSIONAL' }),
        ],
        ['group.pro_see_only_assigned', c.dono, { value: true }],
        // Os dois lados da posse, e a especialidade que some com ela.
        [
          'members.role',
          c.dono,
          expect.objectContaining({ membershipIds: [c.mPro], from: 'PROFESSIONAL', to: 'OWNER' }),
        ],
        ['members.role', c.dono, expect.objectContaining({ from: 'OWNER', to: 'PROFESSIONAL' })],
        [
          'members.specialty',
          c.dono,
          expect.objectContaining({ membershipIds: [c.mPro], from: 'NUTRITION', to: null }),
        ],
      ]),
    );
  });

  it('A6b: a linha do "só quem acompanham" vai junto com a mudança, nunca sozinha', async () => {
    const c = await cenario('a6b');
    // A escrita do grupo falha: a linha da trilha não pode ter ficado.
    jest.spyOn(prisma.group, 'update').mockImplementationOnce(() => {
      throw new Error('falhou');
    });
    await expect(groups.update(c.dono, c.grupo, { proSeeOnlyAssigned: true })).rejects.toThrow();
    expect(
      await prisma.groupAuditLog.count({
        where: { groupId: c.grupo, action: 'group.pro_see_only_assigned' },
      }),
    ).toBe(0);
  });

  it('A7: admin desfaz o banimento de outro admin que o dono baniu', async () => {
    const c = await cenario('a7');
    const admin = await pessoa('Admin a7');
    const outro = await pessoa('Outro admin a7');
    await prisma.groupMembership.create({
      data: { groupId: c.grupo, userId: admin, role: ADMIN, status: MembershipStatus.ACTIVE },
    });
    const mOutro = await prisma.groupMembership.create({
      data: { groupId: c.grupo, userId: outro, role: ADMIN, status: MembershipStatus.ACTIVE },
    });
    await memberships.ban(c.dono, c.grupo, mOutro.id);
    await expect(memberships.unban(admin, c.grupo, mOutro.id)).rejects.toThrow();
  });
});
