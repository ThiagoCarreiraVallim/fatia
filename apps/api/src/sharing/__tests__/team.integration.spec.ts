import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GroupRole, GroupType, MembershipStatus, ShareScope } from '@fatia/db';
import { SeatPoolService } from '../../billing/seat-pool.service';
import { PrismaService } from '../../common/prisma.service';
import { silentNotifications } from '../../notifications/__tests__/silent-notifications';
import { AccessAuditService } from '../access-audit.service';
import { ConsentService } from '../consent.service';
import { GroupService } from '../group.service';
import { InviteService } from '../invite.service';
import { MemberAdminService } from '../member-admin.service';
import { MembershipService } from '../membership.service';
import { PanelService } from '../panel.service';
import { ProfessionalAccessService } from '../professional-access.service';
import { ProfessionalLinkService } from '../professional-link.service';
import { ReportService } from '../report.service';
import { StudentViewService } from '../student-view.service';
import { TeamService } from '../team.service';

const ADMIN = 'ADMIN' as GroupRole;
const RECEPTION = 'RECEPTION' as GroupRole;

/**
 * Equipe, papéis e permissões (#404, ADR 043), contra Postgres real. O critério
 * de pronto da issue: o dono promove a Nina a recepção e o Rafael a
 * administrador, define a especialidade da Helena como treino, liga "só quem
 * acompanham", e a Helena passa a ver só os alunos dela; a recepção não abre
 * nenhum dado de aluno.
 */
describe('equipe, papéis e permissões (integração, #404)', () => {
  const prisma = new PrismaService();
  const links = new ProfessionalLinkService(prisma);
  const access = new ProfessionalAccessService(prisma, new AccessAuditService(prisma));
  const memberships = new MembershipService(prisma, links, silentNotifications);
  const groups = new GroupService(prisma, links);
  const team = new TeamService(prisma, links);
  const consent = new ConsentService(prisma, links);
  const panel = new PanelService(prisma);
  const reports = new ReportService(prisma);
  const config = { get: () => undefined } as unknown as ConfigService;
  const seats = new SeatPoolService(prisma, config, null);
  const memberAdmin = new MemberAdminService(prisma, seats);
  const invites = new InviteService(
    prisma,
    memberships,
    { send: async () => true } as never,
    config,
    silentNotifications,
    seats,
  );
  const studentView = new StudentViewService(
    prisma,
    access,
    ...([null, null, null, null, null, null, null] as never as [never, never, never, never]),
  );

  const stamp = `t404-${Date.now()}`;
  const usuarios: string[] = [];
  let grupo = '';
  let outroGrupo = '';
  const u = { dono: '', nina: '', rafael: '', helena: '', marcos: '', ana: '', bia: '', caio: '' };
  const m = { dono: '', nina: '', rafael: '', helena: '', marcos: '', ana: '', bia: '', caio: '' };
  const TODAS = Object.values(ShareScope);

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

  beforeAll(async () => {
    u.dono = await pessoa('Bruno Dono');
    u.nina = await pessoa('Nina Alves');
    u.rafael = await pessoa('Rafael Duarte');
    u.helena = await pessoa('Helena Prado');
    u.marcos = await pessoa('Marcos Lima');
    u.ana = await pessoa('Ana Aluna');
    u.bia = await pessoa('Bia Aluna');
    u.caio = await pessoa('Caio Aluno');
    const g = await prisma.group.create({
      data: {
        type: GroupType.SPONSORED,
        name: 'Academia 404',
        slug: `${stamp}-a`,
        ownerId: u.dono,
        memberships: {
          create: [
            { userId: u.dono, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
            { userId: u.nina, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
            { userId: u.rafael, role: GroupRole.PROFESSIONAL, status: MembershipStatus.ACTIVE },
            { userId: u.helena, role: GroupRole.PROFESSIONAL, status: MembershipStatus.ACTIVE },
            { userId: u.marcos, role: GroupRole.PROFESSIONAL, status: MembershipStatus.ACTIVE },
            ...[u.ana, u.bia, u.caio].map((userId) => ({
              userId,
              role: GroupRole.MEMBER,
              status: MembershipStatus.ACTIVE,
              consentScopes: TODAS,
            })),
          ],
        },
      },
      include: { memberships: true },
    });
    grupo = g.id;
    for (const k of Object.keys(u) as (keyof typeof u)[]) {
      m[k] = g.memberships.find((x) => x.userId === u[k])!.id;
    }
    // Cada aluno compartilhou tudo com a equipe que pode receber (ADR 026).
    for (const aluno of [u.ana, u.bia, u.caio]) {
      await prisma.professionalLink.createMany({
        data: [u.dono, u.rafael, u.helena, u.marcos].map((professionalId) => ({
          subjectUserId: aluno,
          professionalId,
          groupId: grupo,
          scopes: TODAS,
        })),
      });
    }
    // A Helena acompanha a Ana e a Bia; o Caio é do Marcos.
    await prisma.groupMembership.updateMany({
      where: { id: { in: [m.ana, m.bia] } },
      data: { accompaniedById: m.helena },
    });
    await prisma.groupMembership.update({
      where: { id: m.caio },
      data: { accompaniedById: m.marcos },
    });
    // Uma segunda comunidade, para os ids de fora.
    const donoB = await pessoa('Dona B');
    const profB = await pessoa('Prof B');
    const b = await prisma.group.create({
      data: {
        type: GroupType.SPONSORED,
        name: 'Academia B 404',
        slug: `${stamp}-b`,
        ownerId: donoB,
        memberships: {
          create: [
            { userId: donoB, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
            { userId: profB, role: GroupRole.PROFESSIONAL, status: MembershipStatus.ACTIVE },
          ],
        },
      },
    });
    outroGrupo = b.id;
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: [grupo, outroGrupo] } } });
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.$disconnect();
  });

  describe('o critério de pronto', () => {
    it('o dono promove a Nina a recepção e o Rafael a administrador', async () => {
      // A Nina recebia o e-mail do relatório e o aviso diário: papel novo zera.
      await prisma.groupMembership.update({
        where: { id: m.rafael },
        data: { reportEmail: true, riskDigest: true },
      });
      const nina = await memberships.changeRole(u.dono, grupo, m.nina, RECEPTION as never);
      expect(nina.role).toBe('RECEPTION');
      const rafael = await memberships.changeRole(u.dono, grupo, m.rafael, ADMIN as never);
      expect(rafael.role).toBe('ADMIN');
      // Administrador não recebe vínculo: os que o Rafael recebia caem.
      expect(rafael.revokedLinks).toBe(3);
      const r = await prisma.groupMembership.findUniqueOrThrow({ where: { id: m.rafael } });
      expect(r.reportEmail).toBe(false);
      expect(r.riskDigest).toBe(false);
      const trilha = await prisma.groupAuditLog.findMany({
        where: { groupId: grupo, action: 'members.role' },
      });
      expect(trilha).toHaveLength(2);
      expect(trilha.every((t) => t.actorId === u.dono)).toBe(true);
    });

    it('a especialidade da Helena vira treino, e a do Marcos, nutrição (o vínculo dele encolhe)', async () => {
      const h = await team.setSpecialty(u.dono, grupo, m.helena, 'TRAINING');
      expect(h.specialty).toBe('TRAINING');
      const mk = await team.setSpecialty(u.dono, grupo, m.marcos, 'NUTRITION');
      expect(mk.specialty).toBe('NUTRITION');
      const vivos = await prisma.professionalLink.findMany({
        where: { professionalId: u.marcos, groupId: grupo, revokedAt: null },
      });
      expect(vivos).toHaveLength(3);
      for (const v of vivos) {
        expect([...v.scopes].sort()).toEqual(
          [ShareScope.BODY, ShareScope.GOALS, ShareScope.MEAL_PHOTOS, ShareScope.NUTRITION].sort(),
        );
      }
      // Treino nunca, mesmo com vínculo antigo: a porta nega e registra.
      await expect(
        access.assertReadable(u.marcos, m.caio, ShareScope.WORKOUT, 'teste_404'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        access.assertReadable(u.marcos, m.caio, ShareScope.NUTRITION, 'teste_404'),
      ).resolves.toBe(u.caio);
    });

    it('com "só quem acompanham", a Helena lê e lista só a Ana e a Bia', async () => {
      // Antes de ligar, ela lê o Caio.
      await expect(
        access.assertReadable(u.helena, m.caio, ShareScope.WORKOUT, 'teste_404'),
      ).resolves.toBe(u.caio);
      await groups.update(u.dono, grupo, { proSeeOnlyAssigned: true });

      await expect(
        access.assertReadable(u.helena, m.caio, ShareScope.WORKOUT, 'teste_404'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        access.assertReadable(u.helena, m.ana, ShareScope.WORKOUT, 'teste_404'),
      ).resolves.toBe(u.ana);
      const negada = await prisma.professionalAccessLog.findFirst({
        where: { professionalId: u.helena, subjectUserId: u.caio, denied: true },
      });
      expect(negada).not.toBeNull();

      const alunos = await studentView.listStudents(u.helena);
      expect(alunos.map((a) => a.membershipId).sort()).toEqual([m.ana, m.bia].sort());
      const membros = await memberships.listMembers(u.helena, grupo);
      expect(membros.map((x) => x.membershipId)).not.toContain(m.caio);
      expect(membros.map((x) => x.membershipId)).toEqual(expect.arrayContaining([m.ana, m.bia]));
      // O dono continua vendo todo mundo.
      const doDono = await memberships.listMembers(u.dono, grupo);
      expect(doDono.map((x) => x.membershipId)).toContain(m.caio);
    });

    it('a recepção não abre nenhum dado de aluno, e a negativa fica na trilha', async () => {
      for (const scope of TODAS) {
        await expect(access.assertReadable(u.nina, m.ana, scope, 'teste_404')).rejects.toThrow(
          NotFoundException,
        );
      }
      const negadas = await prisma.professionalAccessLog.count({
        where: { professionalId: u.nina, subjectUserId: u.ana, denied: true },
      });
      expect(negadas).toBe(TODAS.length);
      expect(await studentView.listStudents(u.nina)).toEqual([]);
      // Na lista de membros, só nome, papel, situação e entrada.
      const lista = await memberships.listMembers(u.nina, grupo);
      expect(lista.map((x) => x.membershipId)).toContain(m.caio);
      for (const x of lista) {
        expect(Object.keys(x).sort()).toEqual(
          ['joinedAt', 'membershipId', 'name', 'role', 'status'].sort(),
        );
      }
      // A busca do painel devolve só nomes e nenhuma tela de dado.
      const busca = await panel.search(u.nina, grupo, 'Aluna');
      expect(busca.members.length).toBeGreaterThan(0);
      expect(busca.plans).toEqual([]);
    });
  });

  describe('o administrador', () => {
    it('troca papel de profissional e convida, mas não mexe no dono nem em administrador', async () => {
      await expect(
        memberships.changeRole(u.rafael, grupo, m.dono, GroupRole.PROFESSIONAL),
      ).rejects.toThrow(ConflictException);
      await expect(
        memberships.changeRole(u.rafael, grupo, m.rafael, GroupRole.MEMBER),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        memberships.changeRole(u.rafael, grupo, m.helena, ADMIN as never),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        invites.create(u.rafael, grupo, { role: ADMIN as never, maxUses: 1, expiresInDays: 7 }),
      ).rejects.toThrow(ForbiddenException);
      const convite = await invites.create(u.rafael, grupo, {
        role: RECEPTION as never,
        maxUses: 1,
        expiresInDays: 7,
      });
      expect(convite.invite.role).toBe('RECEPTION');
      await expect(memberships.removeMember(u.rafael, grupo, m.dono)).rejects.toThrow(
        ConflictException,
      );
    });

    it('não vê assentos nem relatório e não passa a posse', async () => {
      await expect(seats.assign(u.rafael, grupo, m.ana)).rejects.toThrow(ForbiddenException);
      await expect(reports.report(u.rafael, grupo)).rejects.toThrow(ForbiddenException);
      await expect(reports.settings(u.rafael, grupo)).rejects.toThrow(ForbiddenException);
      await expect(groups.transferOwnership(u.rafael, grupo, m.rafael)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(groups.remove(u.rafael, grupo)).rejects.toThrow(ForbiddenException);
      const membros = await memberships.listMembers(u.rafael, grupo);
      expect(membros.every((x) => x.hasAiSeat === undefined)).toBe(true);
    });

    it('distribui alunos (trocar responsável) e a troca fica na trilha', async () => {
      await memberAdmin.setAccompaniedBy(u.rafael, grupo, m.caio, m.helena);
      const t = await prisma.groupAuditLog.findFirst({
        where: { groupId: grupo, action: 'members.accompany', actorId: u.rafael },
      });
      expect(t?.targetCount).toBe(1);
    });

    it('vê a equipe, mas o histórico de mudanças é só do dono', async () => {
      const doAdmin = await team.staff(u.rafael, grupo);
      expect(doAdmin.history).toBeNull();
      const doDono = await team.staff(u.dono, grupo);
      expect(doDono.history!.length).toBeGreaterThanOrEqual(4);
      const helena = doDono.staff.find((s) => s.membershipId === m.helena)!;
      expect(helena.specialty).toBe('TRAINING');
      expect(helena.accompanies).toBe(3);
      expect(doDono.staff.map((s) => s.membershipId)).not.toContain(m.ana);
      expect(doDono.proSeeOnlyAssigned).toBe(true);
    });
  });

  describe('regras e trilha', () => {
    it('especialidade é só do profissional', async () => {
      await expect(team.setSpecialty(u.dono, grupo, m.nina, 'NUTRITION')).rejects.toThrow(
        ConflictException,
      );
    });

    it('a recepção aprova só como membro', async () => {
      const novo = await pessoa('Pedido Novo');
      const pedido = await prisma.groupMembership.create({
        data: { groupId: grupo, userId: novo, role: GroupRole.MEMBER },
      });
      await expect(
        memberships.approve(u.nina, grupo, pedido.id, GroupRole.PROFESSIONAL),
      ).rejects.toThrow(ForbiddenException);
      const ok = await memberships.approve(u.nina, grupo, pedido.id, GroupRole.MEMBER);
      expect(ok.status).toBe(MembershipStatus.ACTIVE);
    });

    it('o consentimento por pessoa não dá treino à nutricionista, mesmo marcado', async () => {
      const r = await consent.grant(u.ana, m.marcos, [ShareScope.WORKOUT, ShareScope.NUTRITION]);
      expect(r.scopes).toEqual([ShareScope.NUTRITION]);
    });

    it('o carimbo de último acesso sai dos contadores do painel', async () => {
      await panel.counts(u.helena, grupo);
      const h = await prisma.groupMembership.findUniqueOrThrow({ where: { id: m.helena } });
      expect(h.panelSeenAt).not.toBeNull();
    });

    it('a tabela de permissões vem da matriz', () => {
      const t = team.permissions();
      expect(t.columns).toEqual(['OWNER', 'ADMIN', 'PROFESSIONAL', 'CREATOR', 'RECEPTION']);
      expect(t.rows.find((r) => r.key === 'student_data')!.roles).not.toContain('RECEPTION');
    });

    it('quem sai da equipe deixa os alunos sem responsável', async () => {
      await memberships.removeMember(u.dono, grupo, m.helena);
      const sem = await prisma.groupMembership.findMany({
        where: { id: { in: [m.ana, m.bia, m.caio] } },
        select: { accompaniedById: true },
      });
      expect(sem.every((x) => x.accompaniedById === null)).toBe(true);
    });
  });
});
