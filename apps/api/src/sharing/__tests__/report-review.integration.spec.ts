import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GroupRole, GroupType, InviteOrigin, MembershipStatus } from '@fatia/db';
import { PrismaService } from '../../common/prisma.service';
import type { EmailMessage, EmailService } from '../../notifications/email.service';
import { silentNotifications } from '../../notifications/__tests__/silent-notifications';
import { MembershipService } from '../membership.service';
import { ProfessionalLinkService } from '../professional-link.service';
import { ReportEmailService } from '../report-email.service';
import { ReportService } from '../report.service';

/**
 * As correções da revisão adversarial da #400: o que sairia por diferença
 * (semanas × total, dia a dia, 30 × 7 dias, saída de membro), a linha de uma
 * pessoa só nas origens, e o e-mail mensal (deploy no meio do mês, falha,
 * atraso, fuso inválido) e a marca de destinatário que sobrevivia a sair.
 */
describe('relatório do mês: correções da revisão (integração, #400)', () => {
  const prisma = new PrismaService();
  const reports = new ReportService(prisma);
  const stamp = `rv400-${Date.now()}`;
  const usuarios: string[] = [];
  const grupos: string[] = [];
  let n = 0;
  const em = (iso: string) => new Date(`${iso}T15:00:00Z`);

  async function pessoa(nome: string) {
    n += 1;
    const u = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: nome },
    });
    usuarios.push(u.id);
    return u.id;
  }
  async function comunidade(nome: string, timezone = 'America/Sao_Paulo') {
    const dono = await pessoa(`Dono ${nome}`);
    const g = await prisma.group.create({
      data: {
        type: GroupType.SPONSORED,
        name: nome,
        slug: `${stamp}-${grupos.length}`,
        ownerId: dono,
        timezone,
        createdAt: new Date('2026-01-01T12:00:00Z'),
        memberships: {
          create: [{ userId: dono, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE }],
        },
      },
    });
    grupos.push(g.id);
    return { id: g.id, dono };
  }
  async function membro(
    groupId: string,
    joinedAt = new Date('2026-09-01T12:00:00Z'),
    inviteId?: string,
  ) {
    const userId = await pessoa('Aluno');
    await prisma.groupMembership.create({
      data: {
        groupId,
        userId,
        role: GroupRole.MEMBER,
        status: MembershipStatus.ACTIVE,
        statsOptIn: true,
        joinedAt,
        joinedViaInviteId: inviteId ?? null,
      },
    });
    return userId;
  }
  async function treinou(userId: string, quando: Date) {
    await prisma.workoutSession.create({
      data: { userId, startedAt: new Date(quando.getTime() - 3_600_000), completedAt: quando },
    });
  }

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.$disconnect();
  });

  describe('outubro: semanas × total e saída de membro', () => {
    const g = { id: '', dono: '' };
    const m: string[] = [];
    const NOW = new Date('2026-11-10T15:00:00Z');
    beforeAll(async () => {
      Object.assign(g, await comunidade('Academia Rv'));
      for (let i = 0; i < 13; i += 1) m.push(await membro(g.id));
      // 7 treinam uma vez em cada uma das 4 primeiras semanas.
      for (const u of m.slice(0, 7)) {
        for (const d of ['05', '12', '19', '26']) await treinou(u, em(`2026-10-${d}`));
      }
      // Na semana curta (29 a 31) só uma pessoa treina, 3 vezes.
      for (const d of ['29', '30', '31']) await treinou(m[0]!, em(`2026-10-${d}`));
    });

    it('a semana suprimida não sai por total − semanas visíveis (supressão complementar)', async () => {
      const r = await reports.report(g.dono, g.id, '2026-10', NOW);
      expect(r.weeks[r.weeks.length - 1]!.suppressed).toBe(true);
      const ocultas = r.weeks.filter((w) => w.suppressed);
      expect(ocultas.length).toBeGreaterThanOrEqual(2);
      const visiveis = r.weeks.filter((w) => !w.suppressed).reduce((s, w) => s + w.value!, 0);
      const residuo = r.sessions.total === null ? null : r.sessions.total - visiveis;
      expect(residuo).not.toBe(3);
      // Fecha com a menor semana visível junto: o total continua.
      expect(r.sessions.total).toBe(31);
    });

    it('mês fechado é calculado uma vez: a saída de um membro não muda o número', async () => {
      const antes = await reports.report(g.dono, g.id, '2026-10', NOW);
      await prisma.groupMembership.update({
        where: { groupId_userId: { groupId: g.id, userId: m[0]! } },
        data: { status: MembershipStatus.REMOVED },
      });
      const depois = await reports.report(g.dono, g.id, '2026-10', NOW);
      await prisma.groupMembership.update({
        where: { groupId_userId: { groupId: g.id, userId: m[0]! } },
        data: { status: MembershipStatus.ACTIVE },
      });
      expect(depois.sessions.total).toBe(antes.sessions.total);
      expect(depois.activeMembers).toEqual(antes.activeMembers);
      const snaps = await prisma.monthReportSnapshot.findMany({
        where: { groupId: g.id, month: '2026-10' },
      });
      expect(snaps).toHaveLength(1);
    });

    it('três leituras ao mesmo tempo gravam um retrato só, e todas devolvem o mesmo', async () => {
      const rs = await Promise.all([
        reports.build(g.id, '2026-09', NOW),
        reports.build(g.id, '2026-09', NOW),
        reports.build(g.id, '2026-09', NOW),
      ]);
      expect(rs[1]).toEqual(rs[0]);
      expect(rs[2]).toEqual(rs[0]);
      expect(
        await prisma.monthReportSnapshot.count({ where: { groupId: g.id, month: '2026-09' } }),
      ).toBe(1);
    });

    it('a meta é lida na hora, mesmo com o mês já retratado', async () => {
      await prisma.group.update({ where: { id: g.id }, data: { weeklySessionsGoal: 7 } });
      const r = await reports.report(g.dono, g.id, '2026-10', NOW);
      expect(r.weeklySessionsGoal).toBe(7);
      expect(r.weeksOnGoal).not.toBeNull();
      await prisma.group.update({ where: { id: g.id }, data: { weeklySessionsGoal: null } });
    });

    it('membros ativos por semana, não por dia (um dia a mais não isola uma pessoa)', async () => {
      const r = await reports.report(g.dono, g.id, '2026-10', NOW);
      expect(r.activeByDay.map((c) => c.key)).toEqual([
        '2026-10-07',
        '2026-10-14',
        '2026-10-21',
        '2026-10-28',
        '2026-10-31',
      ]);
    });
  });

  describe('só mês fechado', () => {
    const g = { id: '', dono: '' };
    beforeAll(async () => {
      Object.assign(g, await comunidade('Academia Rv Dia'));
    });

    it('o mês corrente é 400, e a lista de meses começa no mês passado', async () => {
      const NOW = new Date('2026-11-10T15:00:00Z');
      await expect(reports.report(g.dono, g.id, '2026-11', NOW)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      const r = await reports.report(g.dono, g.id, undefined, NOW);
      expect(r.month).toBe('2026-10');
      expect(r.months[0]).toBe('2026-10');
      expect(r.months).toHaveLength(12);
      expect(r).not.toHaveProperty('partial');
    });
  });

  describe('origens: 30 dias − 7 dias', () => {
    const g = { id: '', dono: '' };
    const NOW = new Date('2026-11-10T15:00:00Z');
    beforeAll(async () => {
      Object.assign(g, await comunidade('Academia Rv Origem'));
      const inv = await prisma.groupInvite.create({
        data: {
          groupId: g.id,
          tokenHash: `${stamp}-qr`,
          role: GroupRole.MEMBER,
          label: 'QR da recepção',
          origin: InviteOrigin.QR,
        },
      });
      for (let i = 0; i < 10; i += 1) {
        const u = await membro(g.id, new Date('2026-11-04T12:00:00Z'), inv.id);
        if (i < 5) await treinou(u, new Date('2026-11-05T12:00:00Z'));
      }
      // Uma pessoa só entrou pelo QR entre o 8º e o 30º dia, e treinou no mesmo dia.
      const sozinha = await membro(g.id, new Date('2026-10-20T12:00:00Z'), inv.id);
      await treinou(sozinha, new Date('2026-10-20T18:00:00Z'));
    });

    it('a diferença entre 30 e 7 dias não revela a entrada nem a ativação de uma pessoa', async () => {
      const o7 = await reports.origins(g.dono, g.id, 7, NOW);
      const o30 = await reports.origins(g.dono, g.id, 30, NOW);
      const r7 = o7.rows[0]!;
      const r30 = o30.rows[0]!;
      expect(r7).toMatchObject({ joined: 10, activated: 5 });
      expect(r30.joined).toBeNull();
      expect(r30.activated).toBeNull();
      expect(o30.joined).toBeNull();
      expect(o30.activated).toBeNull();
    });
  });

  describe('origens: linhas pequenas viram "Outras origens"', () => {
    const NOW = new Date('2026-11-10T15:00:00Z');

    async function convite(groupId: string, label: string, email?: string) {
      return prisma.groupInvite.create({
        data: {
          groupId,
          tokenHash: `${stamp}-${label}-${Math.random()}`,
          role: GroupRole.MEMBER,
          label,
          email: email ?? null,
        },
      });
    }

    it('a linha do convite de uma pessoa só não aparece, nem como amostra pequena', async () => {
      const g = await comunidade('Academia Rv Opt');
      const inv = await convite(g.id, 'Convite da Ana', 'ana@x.test');
      await membro(g.id, new Date('2026-11-05T12:00:00Z'), inv.id);
      const o = await reports.origins(g.dono, g.id, 7, NOW);
      expect(o.rows).toEqual([]);
      expect(o.joined).toBe(0);
    });

    it('somadas, as pequenas saem juntas sem rótulo; o total não as revela por diferença', async () => {
      const g = await comunidade('Academia Rv Outras');
      const grande = await convite(g.id, 'Recepção');
      for (let i = 0; i < 6; i += 1)
        await membro(g.id, new Date('2026-11-04T12:00:00Z'), grande.id);
      // Duas pequenas: 3 + 1. Sozinhas não aparecem; juntas (4) também não.
      const a = await convite(g.id, 'Feira');
      const b = await convite(g.id, 'Convite da Bia', 'bia@x.test');
      for (let i = 0; i < 3; i += 1) await membro(g.id, new Date('2026-11-04T12:00:00Z'), a.id);
      await membro(g.id, new Date('2026-11-04T12:00:00Z'), b.id);
      let o = await reports.origins(g.dono, g.id, 7, NOW);
      expect(o.rows.map((r) => r.label)).toEqual(['Recepção']);
      expect(o.joined).toBe(6);

      // Com mais 2 pelo convite da Bia, as pequenas somam 6: "Outras origens", sem rótulo.
      for (let i = 0; i < 2; i += 1) await membro(g.id, new Date('2026-11-04T12:00:00Z'), b.id);
      o = await reports.origins(g.dono, g.id, 7, NOW);
      expect(o.rows.map((r) => [r.label, r.kind, r.joined])).toEqual([
        ['Recepção', 'link', 6],
        [null, 'other', 6],
      ]);
      expect(o.joined).toBe(12);
      expect(JSON.stringify(o)).not.toMatch(/Feira|Bia/);
    });
  });

  describe('marca de destinatário e de aviso diário', () => {
    const links = new ProfessionalLinkService(prisma);
    const memberships = new MembershipService(prisma, links, silentNotifications);

    it('zera ao trocar de papel e ao voltar depois de sair', async () => {
      const g = await comunidade('Academia Rv Marca');
      const prof = await pessoa('Prof Marca');
      const m = await prisma.groupMembership.create({
        data: {
          groupId: g.id,
          userId: prof,
          role: GroupRole.PROFESSIONAL,
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
          reportEmail: true,
          riskDigest: true,
        },
      });
      await memberships.changeRole(g.dono, g.id, m.id, 'CREATOR');
      let agora = await prisma.groupMembership.findUniqueOrThrow({ where: { id: m.id } });
      expect(agora.reportEmail).toBe(false);
      expect(agora.riskDigest).toBe(false);

      await prisma.groupMembership.update({
        where: { id: m.id },
        data: { reportEmail: true, riskDigest: true, status: MembershipStatus.LEFT },
      });
      await prisma.$transaction(
        await memberships.activationOps({
          groupId: g.id,
          userId: prof,
          role: GroupRole.PROFESSIONAL,
          consent: { scopes: [], statsOptIn: false },
          at: new Date(),
        }),
      );
      agora = await prisma.groupMembership.findUniqueOrThrow({ where: { id: m.id } });
      expect(agora.status).toBe(MembershipStatus.ACTIVE);
      expect(agora.reportEmail).toBe(false);
      expect(agora.riskDigest).toBe(false);
    });
  });

  describe('e-mail mensal', () => {
    const SEGREDO = 'segredo-de-teste-do-relatorio-400-abcdef';
    const config = {
      get: (k: string) => (k === 'EMAIL_UNSUBSCRIBE_SECRET' ? SEGREDO : undefined),
    } as unknown as ConfigService;
    let falha = false;
    const enviados: EmailMessage[] = [];
    const email = {
      enabled: true,
      send: async (msg: EmailMessage) => {
        await new Promise((r) => setTimeout(r, 20));
        if (falha) return false;
        enviados.push(msg);
        return true;
      },
    } as unknown as EmailService;
    const job = new ReportEmailService(prisma, reports, email, config);
    const para = (id: string) => enviados.filter((m) => m.to === donoEmail[id]);
    const donoEmail: Record<string, string> = {};
    async function comEmail(nome: string, tz?: string) {
      const g = await comunidade(nome, tz);
      const u = await prisma.user.findUniqueOrThrow({ where: { id: g.dono } });
      donoEmail[g.id] = u.email;
      return g;
    }

    it('comunidade que já existia no deploy (19/11) não recebe outubro no meio do mês', async () => {
      const g = await comEmail('Academia Rv Mail');
      await job.sendMonthlyReports(new Date('2026-11-19T15:00:00Z'), [g.id]);
      const depois = await prisma.group.findUniqueOrThrow({ where: { id: g.id } });
      expect(depois.reportEmailMonth).toBeNull();
      expect(para(g.id)).toHaveLength(0);
    });

    it('envio que falha não perde o mês: o passe seguinte manda', async () => {
      const g = await comEmail('Academia Rv Falha');
      falha = true;
      // 1/12/2026 é terça, 1º dia útil; 9 h em São Paulo.
      expect(await job.sendMonthlyReports(new Date('2026-12-01T12:00:00Z'), [g.id])).toBe(0);
      let grupo = await prisma.group.findUniqueOrThrow({ where: { id: g.id } });
      expect(grupo.reportEmailMonth).toBeNull();
      falha = false;
      expect(await job.sendMonthlyReports(new Date('2026-12-01T12:30:00Z'), [g.id])).toBe(1);
      expect(para(g.id)).toHaveLength(1);
      grupo = await prisma.group.findUniqueOrThrow({ where: { id: g.id } });
      expect(grupo.reportEmailMonth).toBe('2026-11');
    });

    it('três passes ao mesmo tempo mandam um só', async () => {
      const g = await comEmail('Academia Rv Corrida');
      const quando = new Date('2026-12-02T15:00:00Z');
      await Promise.all([
        job.sendMonthlyReports(quando, [g.id]),
        job.sendMonthlyReports(quando, [g.id]),
        job.sendMonthlyReports(quando, [g.id]),
      ]);
      expect(para(g.id)).toHaveLength(1);
    });

    it('servidor fora até depois do 3º dia útil: o mês é pulado', async () => {
      const g = await comEmail('Academia Rv Atraso');
      // 4/12/2026 é sexta, 4º dia útil.
      await job.sendMonthlyReports(new Date('2026-12-04T15:00:00Z'), [g.id]);
      expect(para(g.id)).toHaveLength(0);
      // 3/12 ainda vale.
      await job.sendMonthlyReports(new Date('2026-12-03T15:00:00Z'), [g.id]);
      expect(para(g.id)).toHaveLength(1);
    });

    it('fuso inválido numa comunidade não trava as outras', async () => {
      const ruim = await comEmail('Academia Rv Fuso', 'Marte/Olympus');
      const boa = await comEmail('Academia Rv Boa');
      const sent = await job.sendMonthlyReports(new Date('2026-12-01T15:00:00Z'), [
        ruim.id,
        boa.id,
      ]);
      expect(sent).toBe(1);
      expect(para(boa.id)).toHaveLength(1);
    });
  });
});
