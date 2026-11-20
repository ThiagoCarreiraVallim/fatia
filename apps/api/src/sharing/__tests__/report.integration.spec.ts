import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GroupRole, GroupType, InviteOrigin, MembershipStatus } from '@fatia/db';
import { PrismaService } from '../../common/prisma.service';
import { ReportService } from '../report.service';

/**
 * O relatório do mês e as origens dos convites (#400, Pn-03, Pn-25), no
 * Postgres real. O que importa é a base (`statsOptIn`), o mínimo de 5 de cada
 * lado e que nada se infere por diferença entre o total e as linhas.
 *
 * O "agora" é 10/11/2026, meio-dia em São Paulo: outubro é o mês fechado.
 */
describe('relatório do mês e origens (integração, #400)', () => {
  const prisma = new PrismaService();
  const reports = new ReportService(prisma);
  const NOW = new Date('2026-11-10T15:00:00Z');
  const em = (iso: string) => new Date(`${iso}T15:00:00Z`);

  const stamp = `t400-${Date.now()}`;
  const usuarios: string[] = [];
  const grupos: string[] = [];
  let n = 0;

  async function pessoa(nome: string) {
    n += 1;
    const u = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: nome },
    });
    usuarios.push(u.id);
    return u.id;
  }

  async function comunidade(nome: string) {
    const dono = await pessoa(`Dono ${nome}`);
    const g = await prisma.group.create({
      data: {
        type: GroupType.SPONSORED,
        name: nome,
        slug: `${stamp}-${grupos.length}`,
        ownerId: dono,
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
    nome: string,
    extra: {
      role?: GroupRole;
      statsOptIn?: boolean;
      joinedAt?: Date;
      inviteId?: string;
    } = {},
  ) {
    const userId = await pessoa(nome);
    const m = await prisma.groupMembership.create({
      data: {
        groupId,
        userId,
        role: extra.role ?? GroupRole.MEMBER,
        status: MembershipStatus.ACTIVE,
        statsOptIn: extra.statsOptIn ?? true,
        joinedAt: extra.joinedAt ?? new Date('2026-09-01T12:00:00Z'),
        joinedViaInviteId: extra.inviteId ?? null,
      },
    });
    return { userId, membershipId: m.id };
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

  describe('o mês de outubro da Academia Report', () => {
    const g = { id: '', dono: '', prof: '', profM: '', membro: '' };
    const m: string[] = [];

    beforeAll(async () => {
      const c = await comunidade('Academia Report');
      g.id = c.id;
      g.dono = c.dono;
      const prof = await membro(g.id, 'Prof Helena', {
        role: GroupRole.PROFESSIONAL,
        statsOptIn: false,
      });
      g.prof = prof.userId;
      g.profM = prof.membershipId;
      for (let i = 1; i <= 12; i += 1) m.push((await membro(g.id, `Aluno ${i}`)).userId);
      g.membro = m[0]!;
      const fora = [];
      for (let i = 1; i <= 3; i += 1) {
        fora.push((await membro(g.id, `Sem estatística ${i}`, { statsOptIn: false })).userId);
      }

      // Setembro: 5 treinam (base do "vs mês anterior").
      for (const u of m.slice(0, 5)) await treinou(u, em('2026-09-10'));
      // Outubro: 7 treinam em 5/10 e 12/10; os 5 primeiros voltam em 28/10.
      for (const u of m.slice(0, 7)) {
        await treinou(u, em('2026-10-05'));
        await treinou(u, em('2026-10-12'));
      }
      for (const u of m.slice(0, 5)) await treinou(u, em('2026-10-28'));
      // Quem não aceitou entrar nas estatísticas não conta, nem treinando muito.
      for (const d of ['01', '02', '03', '04', '05']) await treinou(fora[0]!, em(`2026-10-${d}`));

      // Desafio de outubro: 6 com opt-in e 1 sem; 5 pontuaram.
      const desafio = await prisma.groupChallenge.create({
        data: {
          groupId: g.id,
          title: 'Maratona de outubro',
          metric: 'WORKOUT_SESSIONS',
          kind: 'METRIC',
          startsAt: new Date('2026-10-01T03:00:00Z'),
          endsAt: new Date('2026-11-01T03:00:00Z'),
          timezone: 'America/Sao_Paulo',
        },
      });
      const participantes = [...m.slice(0, 6), fora[0]!];
      for (const [i, u] of participantes.entries()) {
        const mem = await prisma.groupMembership.findUniqueOrThrow({
          where: { groupId_userId: { groupId: g.id, userId: u } },
        });
        await prisma.groupChallengeParticipant.create({
          data: {
            challengeId: desafio.id,
            membershipId: mem.id,
            displayName: `P${i}`,
            score: i < 5 ? 3 : 0,
          },
        });
      }
    });

    it('só o dono lê: profissional e membro recebem 403, o dono de outra comunidade 404', async () => {
      await expect(reports.report(g.prof, g.id, '2026-10', NOW)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(reports.report(g.membro, g.id, '2026-10', NOW)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      const outra = await comunidade('Outra Report');
      await expect(reports.report(outra.dono, g.id, '2026-10', NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('membros ativos: base de quem aceitou entrar nas estatísticas, com o mês anterior', async () => {
      const r = await reports.report(g.dono, g.id, '2026-10', NOW);
      expect(r.month).toBe('2026-10');
      expect(r.optIn).toBe(12);
      expect(r.activeMembers).toEqual({ value: 7, percent: 58, deltaPts: 16, delta: 2 });
      // 7 × 2 + 5 = 19; as 5 sessões de quem não aceitou ficam de fora.
      expect(r.sessions.total).toBe(19);
      expect(r.sessions.perActive).toBe(2.7);
      expect(r.sessions.deltaPct).toBe(280);
      expect(r.trainingDays.perActive).toBe(2.7);
    });

    it('voltaram após 14 dias e "sem treino há 7+ dias" pela regra do Em risco', async () => {
      const r = await reports.report(g.dono, g.id, '2026-10', NOW);
      // Os 5 que treinaram em setembro voltaram em 5/10 (25 dias depois).
      expect(r.returned).toBe(5);
      // No fim de outubro: 2 pararam em 12/10 e 5 nunca treinaram.
      expect(r.riskDays).toBe(7);
      expect(r.atRisk).toBe(7);
    });

    it('sessões por bloco de 7 dias: bloco com menos de 5 de um lado fica oculto', async () => {
      const r = await reports.report(g.dono, g.id, '2026-10', NOW);
      // 15 e 29 ficam ocultos (ninguém treinou: 0 é pequeno). Juntos, ainda não
      // fecham um bloco seguro: a menor semana visível (22) some junto, e o
      // total (19) não devolve nenhuma delas por diferença.
      expect(r.weeks.map((w) => [w.key, w.days, w.value, w.suppressed])).toEqual([
        ['1', 7, 7, false],
        ['8', 7, 7, false],
        ['15', 7, null, true],
        ['22', 7, null, true],
        ['29', 3, null, true],
      ]);
      expect(r.sessions.total).toBe(19);
      expect(r.weeksAverage).toBe(7);
      expect(r.weeksOnGoal).toBeNull();
      // Acumulado por semana (no último dia de cada bloco): 7 desde a primeira.
      expect(r.activeByDay).toEqual(
        ['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28', '2026-10-31'].map((key) => ({
          key,
          value: 7,
          suppressed: false,
        })),
      );
    });

    it('desafios: só opt-in conta, e quem terminou some com menos de 5 do outro lado', async () => {
      const r = await reports.report(g.dono, g.id, '2026-10', NOW);
      expect(r.challenges).toHaveLength(1);
      expect(r.challenges[0]).toMatchObject({
        title: 'Maratona de outubro',
        participants: 6,
        finished: null,
        reviewed: 0,
        voided: 0,
      });
      // Participantes: 17 dias em 6 pessoas; os outros 6: 2 dias.
      expect(r.challengeLift).toBe(8.5);
      expect(JSON.stringify(r)).not.toMatch(/Aluno|Sem estatística|P0/);
    });

    it('a meta da equipe é do dono, e o gráfico conta os blocos na meta', async () => {
      await expect(
        reports.updateSettings(g.prof, g.id, { weeklySessionsGoal: 6 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        reports.updateSettings(g.dono, g.id, { weeklySessionsGoal: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      const s = await reports.updateSettings(g.dono, g.id, { weeklySessionsGoal: 6 });
      expect(s.weeklySessionsGoal).toBe(6);
      const r = await reports.report(g.dono, g.id, '2026-10', NOW);
      expect(r.weeklySessionsGoal).toBe(6);
      expect(r.weeksOnGoal).toEqual({ hit: 2, of: 2 });
      await reports.updateSettings(g.dono, g.id, { weeklySessionsGoal: null });
    });

    it('o mês é nomeado e fechado: sem mês abre o anterior; corrente, futuro, malformado ou velho demais é 400', async () => {
      const r = await reports.report(g.dono, g.id, undefined, NOW);
      expect(r.month).toBe('2026-10');
      expect(r.months[0]).toBe('2026-10');
      expect(r.months).toHaveLength(12);
      for (const ruim of ['2026-11', '2026-12', '2026-13', '26-10', '2025-10']) {
        await expect(reports.report(g.dono, g.id, ruim, NOW)).rejects.toBeInstanceOf(
          BadRequestException,
        );
      }
    });

    it('e-mail mensal: liga e desliga, e a equipe marcada é só da comunidade da URL', async () => {
      const s0 = await reports.settings(g.dono, g.id);
      expect(s0.reportEmailEnabled).toBe(true);
      expect(s0.team.map((t) => [t.role, t.reportEmail])).toEqual([
        ['OWNER', true],
        ['PROFESSIONAL', false],
      ]);
      const s1 = await reports.setRecipient(g.dono, g.id, g.profM, true);
      expect(s1.team.find((t) => t.membershipId === g.profM)?.reportEmail).toBe(true);
      // Membro comum não recebe relatório: o id não é da equipe.
      const aluno = await prisma.groupMembership.findUniqueOrThrow({
        where: { groupId_userId: { groupId: g.id, userId: g.membro } },
      });
      await expect(reports.setRecipient(g.dono, g.id, aluno.id, true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(reports.setRecipient(g.prof, g.id, g.profM, false)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      const s2 = await reports.updateSettings(g.dono, g.id, { reportEmailEnabled: false });
      expect(s2.reportEmailEnabled).toBe(false);
      await reports.updateSettings(g.dono, g.id, { reportEmailEnabled: true });
    });
  });

  it('comunidade com menos de 5 que aceitaram: tudo "amostra pequena"', async () => {
    const c = await comunidade('Academia Pequena');
    for (let i = 0; i < 4; i += 1) {
      const u = await membro(c.id, `Pequeno ${i}`);
      await treinou(u.userId, em('2026-10-05'));
    }
    const r = await reports.report(c.dono, c.id, '2026-10', NOW);
    expect(r.optIn).toBeNull();
    expect(r.activeMembers).toEqual({ value: null, percent: null, deltaPts: null, delta: null });
    expect(r.sessions.total).toBeNull();
    expect(r.returned).toBeNull();
    expect(r.atRisk).toBeNull();
    expect(r.weeks.every((w) => w.suppressed)).toBe(true);
  });

  describe('origens dos convites (Pn-25)', () => {
    const o = { id: '', dono: '', prof: '' };
    const convite = { a: '', b: '', c: '', d: '' };

    async function link(origin: InviteOrigin, label: string | null) {
      const i = await prisma.groupInvite.create({
        data: {
          groupId: o.id,
          tokenHash: `${stamp}-${origin}-${label}-${Math.random()}`,
          role: GroupRole.MEMBER,
          origin,
          label,
        },
      });
      return i.id;
    }

    /** `quantos` entram em 20/10 pelo convite; os `ativam` primeiros treinam no dia seguinte. */
    async function entraram(inviteId: string, quantos: number, ativam: number) {
      for (let i = 0; i < quantos; i += 1) {
        const u = await membro(o.id, `Entrou ${inviteId.slice(0, 4)} ${i}`, {
          inviteId,
          joinedAt: em('2026-10-20'),
        });
        if (i < ativam) await treinou(u.userId, em('2026-10-21'));
      }
    }

    beforeAll(async () => {
      const c = await comunidade('Academia Origens');
      o.id = c.id;
      o.dono = c.dono;
      o.prof = (await membro(o.id, 'Prof Origens', { role: GroupRole.PROFESSIONAL })).userId;
      convite.a = await link(InviteOrigin.QR, 'recepção');
      convite.c = await link(InviteOrigin.INSTAGRAM, null);
      convite.b = await link(InviteOrigin.SITE, null);
      await entraram(convite.a, 10, 5);
      await entraram(convite.c, 6, 3);
      await entraram(convite.b, 3, 0);
      // Quem não aceitou entrar nas estatísticas não conta, e quem entrou antes do período também não.
      await membro(o.id, 'Sem estatística', {
        inviteId: convite.a,
        joinedAt: em('2026-10-20'),
        statsOptIn: false,
      });
      await membro(o.id, 'Antiga', { inviteId: convite.a, joinedAt: em('2026-09-01') });
    });

    it('só o dono abre; o profissional recebe 403', async () => {
      await expect(reports.origins(o.prof, o.id, 30, NOW)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('linha pequena não aparece nem entra no total; sozinha, não vira "Outras origens"', async () => {
      const r = await reports.origins(o.dono, o.id, 30, NOW);
      const por = Object.fromEntries(r.rows.map((x) => [x.origin, x]));
      expect(por.QR).toMatchObject({
        label: 'recepção',
        kind: 'qr',
        joined: 10,
        activated: 5,
        percent: 50,
      });
      // 3 de 6 ativaram: um lado com menos de 5, a taxa não sai.
      expect(por.INSTAGRAM).toMatchObject({
        kind: 'link',
        joined: 6,
        activated: null,
        percent: null,
      });
      // As 3 do Site (menos de 5) não aparecem, nem somadas no total: total
      // menos as linhas visíveis devolveria a linha pequena.
      expect(por.SITE).toBeUndefined();
      expect(r.rows).toHaveLength(2);
      expect(r.joined).toBe(16);
      // Nas linhas sem taxa (Instagram, 3 e 3), um lado tem menos de 5.
      expect(r.activated).toBeNull();
      expect(JSON.stringify(r)).not.toMatch(/Entrou|Antiga|Sem estatística/);
    });

    it('com duas linhas pequenas que somam 5 ou mais, sai uma "Outras origens" sem rótulo', async () => {
      convite.d = await link(InviteOrigin.REFERRAL, 'amigos');
      await entraram(convite.d, 4, 2);
      const r = await reports.origins(o.dono, o.id, 30, NOW);
      expect(r.rows.at(-1)).toMatchObject({
        key: 'other',
        origin: null,
        label: null,
        kind: 'other',
        joined: 7,
        activated: null,
      });
      expect(JSON.stringify(r)).not.toMatch(/amigos|SITE|REFERRAL/);
      expect(r.joined).toBe(23);
      // Nas linhas sem taxa: 3 + 0 + 2 ativaram e 3 + 3 + 2 não, os dois lados com 5 ou mais.
      expect(r.activated).toBe(10);
      expect(r.percent).toBe(43);
    });

    it('7 dias: ninguém entrou no período, a tela mostra o vazio', async () => {
      const r = await reports.origins(o.dono, o.id, 7, NOW);
      expect(r.rows).toEqual([]);
      expect(r.joined).toBe(0);
    });
  });
});
