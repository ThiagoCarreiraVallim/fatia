import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import type { EmailService } from '../../notifications/email.service';
import { silentNotifications } from '../../notifications/__tests__/silent-notifications';
import { GroupService } from '../group.service';
import { hashInviteToken, InviteService } from '../invite.service';
import { MembershipService } from '../membership.service';
import { PanelService } from '../panel.service';
import { ProfessionalLinkService } from '../professional-link.service';

/**
 * O painel base do redesign (#398) no Postgres real: os contadores do menu, a
 * Visão geral (com o mínimo de 5 e o `statsOptIn`) e a busca ⌘K por papel.
 */
describe('painel base (#398, integração)', () => {
  const prisma = new PrismaService();
  const links = new ProfessionalLinkService(prisma);
  const memberships = new MembershipService(prisma, links, silentNotifications);
  const email = { send: async () => true, enabled: false } as unknown as EmailService;
  const config = { get: () => 'https://fatia.test/' } as unknown as ConfigService;
  const invites = new InviteService(prisma, memberships, email, config, silentNotifications);
  const groups = new GroupService(prisma, links, []);
  const panel = new PanelService(prisma);

  const stamp = `painel398-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;
  const DIA = 86_400_000;

  async function pessoa(nome: string) {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: nome },
    });
    criados.push(user.id);
    return user.id;
  }

  async function comunidade(nome = 'Academia') {
    const dono = await pessoa('Dona Bruna');
    const g = await groups.create(dono, {
      type: 'SPONSORED',
      name: nome,
      joinPolicy: 'OPEN',
      visibility: 'PUBLIC',
    });
    grupos.push(g.id);
    const prof = await pessoa('Helena Prof');
    await prisma.groupMembership.create({
      data: {
        groupId: g.id,
        userId: prof,
        role: 'PROFESSIONAL',
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });
    return { groupId: g.id, slug: g.slug, dono, prof };
  }

  /** Membro ativo, com a entrada no passado (`diasAtras`) e o opt-in das estatísticas. */
  async function membro(
    groupId: string,
    nome: string,
    o: { diasAtras?: number; optIn?: boolean; via?: 'INVITE' | 'CODE' | 'PAGE' | null } = {},
  ) {
    const userId = await pessoa(nome);
    const m = await prisma.groupMembership.create({
      data: {
        groupId,
        userId,
        role: 'MEMBER',
        status: 'ACTIVE',
        joinedAt: new Date(Date.now() - (o.diasAtras ?? 60) * DIA),
        statsOptIn: o.optIn ?? false,
        joinVia: o.via ?? null,
      },
    });
    return { userId, membershipId: m.id };
  }

  async function treino(userId: string, diasAtras: number) {
    const fim = new Date(Date.now() - diasAtras * DIA);
    await prisma.workoutSession.create({
      data: { userId, startedAt: new Date(fim.getTime() - 3_600_000), completedAt: fim },
    });
  }

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  describe('origem da entrada (joinVia)', () => {
    it('slug grava PAGE, código grava CODE e convite grava INVITE', async () => {
      const a = await comunidade();
      const pelaPagina = await pessoa('Pela Página');
      await memberships.requestJoin(pelaPagina, a.slug, { scopes: [], statsOptIn: false });

      const codigo = await invites.create(a.dono, a.groupId, { role: 'MEMBER', code: true });
      const peloCodigo = await pessoa('Pelo Código');
      await memberships.requestJoin(peloCodigo, codigo.invite.code!, {
        scopes: [],
        statsOptIn: false,
      });

      const token = `tok-${stamp}`;
      await prisma.groupInvite.create({
        data: {
          groupId: a.groupId,
          tokenHash: hashInviteToken(token),
          role: 'MEMBER',
          expiresAt: new Date(Date.now() + 7 * DIA),
        },
      });
      const peloConvite = await pessoa('Pelo Convite');
      await invites.accept(peloConvite, token, { scopes: [], statsOptIn: false });

      const via = async (userId: string) =>
        (
          await prisma.groupMembership.findUniqueOrThrow({
            where: { groupId_userId: { groupId: a.groupId, userId } },
          })
        ).joinVia;
      expect(await via(pelaPagina)).toBe('PAGE');
      expect(await via(peloCodigo)).toBe('CODE');
      expect(await via(peloConvite)).toBe('INVITE');
    });

    it('o pedido que espera aprovação guarda a origem até ser aprovado', async () => {
      const dono = await pessoa('Dono');
      const g = await groups.create(dono, {
        type: 'SPONSORED',
        name: 'Com aprovação',
        joinPolicy: 'APPROVAL',
        visibility: 'PUBLIC',
      });
      grupos.push(g.id);
      const quem = await pessoa('Pedinte');
      const r = await memberships.requestJoin(quem, g.slug, { scopes: [], statsOptIn: false });
      await memberships.approve(dono, g.id, r.membershipId);
      const m = await prisma.groupMembership.findUniqueOrThrow({ where: { id: r.membershipId } });
      expect(m).toMatchObject({ status: 'ACTIVE', joinVia: 'PAGE' });
    });
  });

  describe('contadores do menu', () => {
    it('o dono vê pedidos, convites sem aceite, denúncias e a fila; o profissional só o que o papel faz', async () => {
      const a = await comunidade();
      await membro(a.groupId, 'Ana');
      const pedinte = await pessoa('Marcos Reis');
      await prisma.groupMembership.create({
        data: { groupId: a.groupId, userId: pedinte, role: 'MEMBER', status: 'INVITED' },
      });
      // O contador é o da tela Ativação pendente (#401): convidado há 2 dias ou
      // mais, sem aceite, sem revogar e sem recusa (vencido conta: dá para renovar),
      // e o profissional só conta os convites de membro.
      const ha3dias = new Date(Date.now() - 3 * DIA);
      for (const [i, extra] of [
        {},
        { revokedAt: new Date() },
        { expiresAt: new Date(Date.now() - DIA) },
        { uses: 1 },
        { declinedAt: new Date() },
        { createdAt: new Date(Date.now() - DIA) },
        { role: 'PROFESSIONAL' as const },
      ].entries()) {
        await prisma.groupInvite.create({
          data: {
            groupId: a.groupId,
            tokenHash: hashInviteToken(`${stamp}-c-${i}`),
            email: `convidado${i}@x.test`,
            role: 'MEMBER',
            maxUses: 1,
            createdAt: ha3dias,
            expiresAt: new Date(Date.now() + 7 * DIA),
            ...extra,
          },
        });
      }

      const dono = await panel.counts(a.dono, a.groupId);
      expect(dono).toEqual({
        pendingRequests: 1,
        pendingInvites: 3,
        openReports: 0,
        challengeReview: 0,
      });
      const prof = await panel.counts(a.prof, a.groupId);
      expect(prof).toEqual({
        pendingRequests: null,
        pendingInvites: 2,
        openReports: null,
        challengeReview: 0,
      });
    });

    it('membro comum não abre; quem é de fora nem descobre a comunidade', async () => {
      const a = await comunidade();
      const ana = await membro(a.groupId, 'Ana');
      const b = await comunidade('Outra');
      await expect(panel.counts(ana.userId, a.groupId)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(panel.counts(b.dono, a.groupId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(panel.overview(b.dono, a.groupId, 30)).rejects.toBeInstanceOf(NotFoundException);
      await expect(panel.search(b.prof, a.groupId, 'Ana')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('visão geral', () => {
    it('novos da semana por origem, sem contar a equipe nem quem entrou antes', async () => {
      const a = await comunidade();
      await membro(a.groupId, 'Convite 1', { diasAtras: 1, via: 'INVITE' });
      await membro(a.groupId, 'Código 1', { diasAtras: 2, via: 'CODE' });
      await membro(a.groupId, 'Página 1', { diasAtras: 3, via: 'PAGE' });
      await membro(a.groupId, 'Antigo', { diasAtras: 20, via: 'PAGE' });
      const v = await panel.overview(a.dono, a.groupId, 30);
      expect(v.newThisWeek).toEqual({ total: 3, viaInvite: 2, viaPage: 1, viaUnknown: 0 });
      expect(v.members).toEqual({ active: 4, joinedLast30Days: 4 });
    });

    it('quem entrou sem origem gravada aparece em viaUnknown, e a soma fecha', async () => {
      const a = await comunidade();
      await membro(a.groupId, 'Convite', { diasAtras: 1, via: 'INVITE' });
      await membro(a.groupId, 'Sem origem', { diasAtras: 2, via: null });
      const v = await panel.overview(a.dono, a.groupId, 7);
      expect(v.newThisWeek).toEqual({ total: 2, viaInvite: 1, viaPage: 0, viaUnknown: 1 });
    });

    it('o profissional não recebe os agregados (insights.read é do dono)', async () => {
      const a = await comunidade();
      const v = await panel.overview(a.prof, a.groupId, 7);
      expect(v.aggregates).toBeNull();
      expect((await panel.overview(a.dono, a.groupId, 7)).aggregates).not.toBeNull();
    });

    it('"ainda não registraram": só número, só com 5 ou mais no opt-in, e quem recusou não conta', async () => {
      const a = await comunidade();
      // 4 novos com opt-in: amostra pequena, o cartão some.
      const novos = [];
      for (let i = 0; i < 4; i++) {
        novos.push(await membro(a.groupId, `Novo ${i}`, { diasAtras: 5, optIn: true }));
      }
      // Quem recusou a estatística não entra nem no denominador.
      for (let i = 0; i < 6; i++) await membro(a.groupId, `Sem opt-in ${i}`, { diasAtras: 5 });
      let v = await panel.overview(a.dono, a.groupId, 30);
      expect(v.aggregates!.notLoggedYet).toBeNull();

      // Com 10 novos no opt-in (5 treinaram, 5 não), sai o número e mais nada.
      for (let i = 4; i < 10; i++) {
        novos.push(await membro(a.groupId, `Novo ${i}`, { diasAtras: 5, optIn: true }));
      }
      for (const m of novos.slice(0, 5)) await treino(m.userId, 2);
      v = await panel.overview(a.dono, a.groupId, 30);
      expect(v.aggregates!.notLoggedYet).toBe(5);
      const texto = JSON.stringify(v);
      for (const m of novos) expect(texto).not.toContain(m.userId);
      expect(texto).not.toContain('Novo ');
    });

    it('ativos em 7 dias e o gráfico passam pelo mínimo de 5 pessoas', async () => {
      const a = await comunidade();
      const gente = [];
      for (let i = 0; i < 12; i++) {
        gente.push(await membro(a.groupId, `Aluno ${i}`, { optIn: true }));
      }
      // 7 treinaram ontem; 5 não treinaram na semana.
      for (const m of gente.slice(0, 7)) await treino(m.userId, 1);
      // Só 2 treinaram há 3 dias: célula pequena, nunca publicada.
      for (const m of gente.slice(0, 2)) await treino(m.userId, 3);

      const v = await panel.overview(a.dono, a.groupId, 7);
      expect(v.aggregates!.active7d).toEqual({ value: 7, percent: 58 });
      const pessoas = v.aggregates!.activity.people;
      expect(pessoas).toHaveLength(7);
      const publicadas = pessoas.filter((c) => !c.suppressed);
      for (const c of publicadas) expect(c.value === 0 || (c.value ?? 0) >= 5).toBe(true);
      expect(pessoas.some((c) => c.value === 2)).toBe(false);
      expect(v.aggregates!.activity.workouts.some((c) => c.value === 2)).toBe(false);
    });

    it('com menos de 5 no opt-in, nenhum agregado sai', async () => {
      const a = await comunidade();
      for (let i = 0; i < 4; i++) {
        const m = await membro(a.groupId, `Aluno ${i}`, { optIn: true });
        await treino(m.userId, 1);
      }
      const v = await panel.overview(a.dono, a.groupId, 30);
      expect(v.aggregates!.active7d).toEqual({ value: null, percent: null });
      expect(v.aggregates!.activity.workouts.some((c) => (c.value ?? 0) > 0)).toBe(false);
    });

    it('com 5 ou mais no opt-in, o lado pequeno do indicador some pelo suppress', async () => {
      const a = await comunidade();
      const gente = [];
      for (let i = 0; i < 8; i++)
        gente.push(await membro(a.groupId, `Aluno ${i}`, { optIn: true }));
      // 3 treinaram, 5 não: o lado de 3 é pequeno, e o de 5 sozinho entregaria o outro.
      for (const m of gente.slice(0, 3)) await treino(m.userId, 2);
      const v = await panel.overview(a.dono, a.groupId, 7);
      expect(v.aggregates!.active7d).toEqual({ value: null, percent: null });
      expect(v.aggregates!.activity.people.some((c) => c.value === 3)).toBe(false);
      expect(v.aggregates!.activity.workouts.some((c) => c.value === 3)).toBe(false);
    });

    it('cada dia do gráfico também é de dois lados: 0 treinos ou menos de 5 parados somem', async () => {
      const a = await comunidade();
      const gente = [];
      for (let i = 0; i < 8; i++)
        gente.push(await membro(a.groupId, `Aluno ${i}`, { optIn: true }));
      // Ontem 6 treinaram e só 2 não: o lado de 2 entregaria quem ficou parado.
      for (const m of gente.slice(0, 6)) await treino(m.userId, 1);
      const v = await panel.overview(a.dono, a.groupId, 7);
      for (const serie of [v.aggregates!.activity.workouts, v.aggregates!.activity.people]) {
        // Nenhum dia sai: nos outros ninguém treinou (0 também é pequeno).
        expect(serie.every((c) => c.value === null && c.suppressed)).toBe(true);
      }
    });

    it('"0 treinaram" e "0 registraram" também são pequenos: somem', async () => {
      const a = await comunidade();
      for (let i = 0; i < 6; i++)
        await membro(a.groupId, `Novo ${i}`, { diasAtras: 5, optIn: true });
      const v = await panel.overview(a.dono, a.groupId, 7);
      expect(v.aggregates!.active7d).toEqual({ value: null, percent: null });
      expect(v.aggregates!.notLoggedYet).toBeNull();
    });

    it('só membro entra no indicador: a equipe com opt-in não conta', async () => {
      const a = await comunidade();
      const novos = [];
      for (let i = 0; i < 10; i++) {
        novos.push(await membro(a.groupId, `Novo ${i}`, { diasAtras: 5, optIn: true }));
      }
      for (const m of novos.slice(0, 5)) await treino(m.userId, 2);
      const prof2 = await pessoa('Prof com opt-in');
      await prisma.groupMembership.create({
        data: {
          groupId: a.groupId,
          userId: prof2,
          role: 'PROFESSIONAL',
          status: 'ACTIVE',
          statsOptIn: true,
          joinedAt: new Date(Date.now() - 5 * DIA),
        },
      });
      const v = await panel.overview(a.dono, a.groupId, 30);
      expect(v.aggregates!.notLoggedYet).toBe(5);
      expect(v.aggregates!.active7d.percent).toBe(50);
    });

    it('as janelas são de dias inteiros no fuso: o número não muda no meio do dia', async () => {
      const a = await comunidade();
      await prisma.group.update({
        where: { id: a.groupId },
        data: { timezone: 'America/Sao_Paulo' },
      });
      // Meia-noite de hoje em São Paulo (03:00 UTC); 10h e 20h do mesmo dia.
      const hoje = new Date();
      const meiaNoite = new Date(
        Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - 1, 3),
      );
      const dez = new Date(meiaNoite.getTime() + 10 * 3_600_000);
      const vinte = new Date(meiaNoite.getTime() + 20 * 3_600_000);

      // "Ainda não registraram": 5 novos treinaram, 6 não; X entrou há 30 dias às 15h.
      const entra = async (nome: string, em: Date) => {
        const userId = await pessoa(nome);
        await prisma.groupMembership.create({
          data: {
            groupId: a.groupId,
            userId,
            role: 'MEMBER',
            status: 'ACTIVE',
            statsOptIn: true,
            joinedAt: em,
          },
        });
        return userId;
      };
      const treinou = async (userId: string, em: Date) =>
        prisma.workoutSession.create({
          data: { userId, startedAt: new Date(em.getTime() - 3_600_000), completedAt: em },
        });
      for (let i = 0; i < 5; i++) {
        const u = await entra(`Treinou ${i}`, new Date(dez.getTime() - 10 * DIA));
        await treinou(u, new Date(dez.getTime() - 2 * DIA));
      }
      for (let i = 0; i < 5; i++) await entra(`Parado ${i}`, new Date(dez.getTime() - 10 * DIA));
      await entra('X', new Date(dez.getTime() - 30 * DIA + 5 * 3_600_000));
      // "Ativos em 7 dias": Y treinou só há 7 dias, às 15h.
      const y = await entra('Y', new Date(dez.getTime() - 60 * DIA));
      await treinou(y, new Date(dez.getTime() - 7 * DIA + 5 * 3_600_000));

      const cedo = await panel.overview(a.dono, a.groupId, 7, dez);
      const tarde = await panel.overview(a.dono, a.groupId, 7, vinte);
      expect(cedo.aggregates!.notLoggedYet).toBe(6);
      expect(tarde.aggregates!.notLoggedYet).toBe(6);
      expect(cedo.aggregates!.active7d).toEqual(tarde.aggregates!.active7d);
      expect(cedo.aggregates!.active7d.value).toBe(6);
    });
  });

  describe('busca ⌘K', () => {
    it('acha membros pelo nome, só desta comunidade, e nunca devolve dado de saúde', async () => {
      const a = await comunidade();
      const b = await comunidade('Outra');
      const ana = await membro(a.groupId, 'Ana Dias');
      await membro(b.groupId, 'Ana de Fora');
      await prisma.weightLog.create({
        data: { userId: ana.userId, weightKg: 61.5, loggedAt: new Date() },
      });

      const r = await panel.search(a.dono, a.groupId, 'ana');
      expect(r.members.map((m) => m.name)).toEqual(['Ana Dias']);
      expect(r.members[0]).toEqual({
        membershipId: ana.membershipId,
        name: 'Ana Dias',
        role: 'MEMBER',
        status: 'ACTIVE',
      });
      const texto = JSON.stringify(r);
      expect(texto).not.toMatch(/weight|kg|61[.,]5|email|statsOptIn|scopes/i);
    });

    it('telas e planos dependem do papel; o profissional não vê assentos nem moderação', async () => {
      const a = await comunidade();
      await prisma.groupPlanTemplate.create({
        data: {
          groupId: a.groupId,
          authorId: a.prof,
          kind: 'WORKOUT',
          title: 'Hipertrofia A/B',
          snapshot: {},
          snapshotVersion: 1,
          publishedAt: new Date(),
        },
      });
      const prof = await panel.search(a.prof, a.groupId, 'a');
      // A busca devolve até 6 telas: "assent" isola a de assentos (#400 pôs mais telas com "a").
      const telas = async (quem: typeof a.dono, q: string) =>
        (await panel.search(quem, a.groupId, q)).screens.map((s) => s.key);
      expect(await telas(a.dono, 'assent')).toContain('seats');
      expect(await telas(a.prof, 'assent')).not.toContain('seats');
      // Relatório e origens são do dono (`insights.read`, #400).
      expect(await telas(a.dono, 'relat')).toContain('report');
      expect(await telas(a.prof, 'relat')).not.toContain('report');
      expect(await telas(a.dono, 'origem')).toContain('origins');
      expect(await telas(a.prof, 'origem')).not.toContain('origins');
      expect(prof.screens.map((s) => s.key)).not.toContain('moderation');
      expect(prof.plans.map((p) => p.title)).toEqual(['Hipertrofia A/B']);
      expect((await panel.search(a.dono, a.groupId, 'hipert')).plans[0]).toMatchObject({
        title: 'Hipertrofia A/B',
        kind: 'WORKOUT',
      });
    });

    it('plano de outra comunidade nunca aparece', async () => {
      const a = await comunidade();
      const b = await comunidade('Outra');
      await prisma.groupPlanTemplate.create({
        data: {
          groupId: b.groupId,
          kind: 'WORKOUT',
          title: 'Plano Secreto',
          snapshot: {},
          snapshotVersion: 1,
          publishedAt: new Date(),
        },
      });
      expect((await panel.search(a.dono, a.groupId, 'secreto')).plans).toEqual([]);
    });

    it('membro comum não busca; texto vazio devolve vazio', async () => {
      const a = await comunidade();
      const ana = await membro(a.groupId, 'Ana');
      await expect(panel.search(ana.userId, a.groupId, 'a')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(await panel.search(a.dono, a.groupId, '   ')).toEqual({
        members: [],
        screens: [],
        plans: [],
      });
    });
  });
});
