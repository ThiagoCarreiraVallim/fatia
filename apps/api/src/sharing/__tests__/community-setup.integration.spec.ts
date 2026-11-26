import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  ChallengeMetric,
  GroupKind,
  GroupRole,
  GroupType,
  MembershipStatus,
  SetupStep,
} from '@fatia/db';
import { checkBrandColor } from '@fatia/design';
import { PrismaService } from '../../common/prisma.service';
import type { EmailService } from '../../notifications/email.service';
import type { Notice, NotificationService } from '../../notifications/notification.service';
import { silentNotifications } from '../../notifications/__tests__/silent-notifications';
import { DailyAdherenceService } from '../../nutrition/daily-adherence.service';
import { addDaysIso, todayInTz } from '../../progress/helpers/date-tz';
import { ScoreboardService } from '../../social/scoreboard.service';
import { ChallengeService } from '../challenge.service';
import { CommunitySetupService } from '../community-setup.service';
import { GroupService } from '../group.service';
import { InviteService } from '../invite.service';
import { MembershipService } from '../membership.service';
import { ProfessionalLinkService } from '../professional-link.service';

/**
 * Onboarding de quem cria a comunidade (#372), contra Postgres real: criar com
 * o tipo, o endereço livre, o checklist que se marca sozinho pela ação, à mão,
 * fecha e repete; "comunidade ativa" = checklist completo; o desafio sem push;
 * a recusa do convite avisando o dono.
 */
describe('onboarding de quem cria a comunidade (#372, integração)', () => {
  const prisma = new PrismaService();
  const links = new ProfessionalLinkService(prisma);
  const groups = new GroupService(prisma, links, []);
  const setup = new CommunitySetupService(prisma);
  const avisos: { to: string[]; notice: Notice }[] = [];
  const notifications = {
    ...silentNotifications,
    notify: (to: string[], notice: Notice) => {
      avisos.push({ to, notice });
    },
  } as unknown as NotificationService;
  const challenges = new ChallengeService(
    prisma,
    new ScoreboardService(prisma, new DailyAdherenceService(prisma)),
    notifications,
  );
  const memberships = new MembershipService(prisma, links, silentNotifications);
  const email = { send: async () => true } as unknown as EmailService;
  const config = {
    get: (k: string) =>
      k === 'INVITE_LINK_SECRET' ? 'segredo-de-teste-do-link-372-variado' : 'https://fatia.test/',
  } as unknown as ConfigService;
  const invites = new InviteService(prisma, memberships, email, config, notifications);

  const stamp = `t372-${Date.now()}`;
  const usuarios: string[] = [];
  const grupos: string[] = [];
  let n = 0;
  const u = { bruno: '', helena: '', outra: '', aluna: '' };

  async function pessoa(nome: string, mail?: string) {
    n += 1;
    const x = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: mail ?? `${stamp}-${n}@test.local`, name: nome },
    });
    usuarios.push(x.id);
    return x.id;
  }

  async function criar(owner: string, kind: GroupKind | undefined, type = GroupType.SPONSORED) {
    const g = await groups.create(owner, {
      type,
      kind,
      name: 'Academia Demo',
      slug: `${stamp}-${grupos.length}`,
    });
    grupos.push(g.id);
    return g.id;
  }

  beforeAll(async () => {
    u.bruno = await pessoa('Bruno Lima');
    u.helena = await pessoa('Helena Souza', `${stamp}-helena@test.local`);
    u.outra = await pessoa('Outra Dona');
    u.aluna = await pessoa('Carla');
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.$disconnect();
  });

  it('cria com o tipo; academia × personal só na patrocinada', async () => {
    const id = await criar(u.bruno, GroupKind.COACH);
    expect((await prisma.group.findUniqueOrThrow({ where: { id } })).kind).toBe(GroupKind.COACH);
    await expect(
      groups.create(u.bruno, {
        type: GroupType.SOCIAL,
        kind: GroupKind.GYM,
        name: 'Grupo',
        slug: `${stamp}-x`,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Personal não tem o passo Equipamentos.
    expect((await setup.get(u.bruno, id)).total).toBe(8);
  });

  it('o endereço do nome, ou o primeiro com número livre', async () => {
    const nome = `Força ${stamp}`;
    const livre = await setup.slugCheck(nome);
    expect(livre).toEqual({ slug: `forca-${stamp}`, taken: false });
    const g = await groups.create(u.outra, {
      type: GroupType.SOCIAL,
      name: nome,
      slug: livre.slug,
    });
    grupos.push(g.id);
    expect(await setup.slugCheck(nome)).toEqual({ slug: `forca-${stamp}-2`, taken: true });
  });

  it('recém-criada: 1 de 9, a marca bloqueia; salvar a cor (já corrigida) libera', async () => {
    const id = await criar(u.bruno, GroupKind.GYM);
    const antes = await setup.get(u.bruno, id);
    expect(antes).toMatchObject({ done: 1, total: 9, brandPending: true, visible: true });
    // "Ver na web" do app (Onb-C3): o painel desta comunidade na web.
    expect(antes.webUrl).toMatch(new RegExp(`/org/${id}$`));
    // O editor da Marca avisa e manda o tom corrigido; a API só aceita 4,5:1 (ADR 041).
    await expect(groups.update(u.bruno, id, { brandColor: '#7c5cff' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect((await setup.get(u.bruno, id)).brandPending).toBe(true);
    const check = checkBrandColor('#7c5cff');
    if (check.status !== 'warning') throw new Error('o roxo deveria pedir outro tom');
    await groups.update(u.bruno, id, { brandColor: check.suggestion });
    expect((await setup.get(u.bruno, id)).brandPending).toBe(false);
  });

  it('salvar acesso e categorias marca os passos', async () => {
    const id = await criar(u.bruno, GroupKind.GYM);
    await groups.update(u.bruno, id, { postPolicy: 'TEAM_ONLY' });
    await groups.update(u.bruno, id, { requiredSharingScopes: [] });
    const s = await setup.get(u.bruno, id);
    const feito = (k: string) => s.items.find((i) => i.key === k)!.done;
    expect(feito('ACCESS')).toBe(true);
    expect(feito('CATEGORIES')).toBe(true);
  });

  it('convite e desafio marcam sozinhos, sem "Desfazer"', async () => {
    const id = await criar(u.bruno, GroupKind.GYM);
    await invites.create(u.bruno, id, { role: GroupRole.MEMBER, label: 'Recepção', origin: 'QR' });
    await invites.create(u.bruno, id, { role: GroupRole.PROFESSIONAL, maxUses: 1 });
    const hoje = todayInTz('America/Sao_Paulo');
    await challenges.create(u.bruno, id, {
      title: 'Constância 30 dias',
      metric: ChallengeMetric.ACTIVE_DAYS,
      startDate: hoje,
      endDate: addDaysIso(hoje, 29),
    });
    const s = await setup.get(u.bruno, id);
    for (const k of ['MEMBERS', 'TEAM', 'CHALLENGE']) {
      expect(s.items.find((i) => i.key === k)).toEqual({ key: k, done: true, auto: true });
    }
    // Desmarcar à mão não desfaz o que o dado mostra.
    const desfeito = await setup.setStep(u.bruno, id, SetupStep.CHALLENGE, false);
    expect(desfeito.items.find((i) => i.key === 'CHALLENGE')!.done).toBe(true);
  });

  it('marcar à mão completa; o guia some; "Repetir o guia" volta; fechar esconde', async () => {
    const id = await criar(u.bruno, GroupKind.COACH);
    await groups.update(u.bruno, id, { brandColor: '#ff7a1a' });
    let s = await setup.get(u.bruno, id);
    for (const step of [
      SetupStep.CATEGORIES,
      SetupStep.TEAM,
      SetupStep.MEMBERS,
      SetupStep.CHALLENGE,
      SetupStep.PLAN,
      SetupStep.ACCESS,
    ]) {
      s = await setup.setStep(u.bruno, id, step, true);
    }
    expect(s).toMatchObject({ done: 8, total: 8, complete: true, visible: false });
    expect((await setup.firstSteps(u.bruno, id)).active).toBe(true);

    s = await setup.setGuide(u.bruno, id, true);
    expect(s.visible).toBe(true);
    s = await setup.setGuide(u.bruno, id, false);
    expect(s.visible).toBe(false);

    // Desmarcar à mão volta a faltar, e marcar de novo não duplica.
    await setup.setStep(u.bruno, id, SetupStep.PLAN, true);
    s = await setup.setStep(u.bruno, id, SetupStep.PLAN, false);
    expect(s.done).toBe(7);
    const g = await prisma.group.findUniqueOrThrow({ where: { id } });
    expect(g.setupSteps.filter((x) => x === SetupStep.PLAN)).toHaveLength(0);
  });

  it('comunidade ativa = checklist completo, não 5 membros', async () => {
    const id = await criar(u.bruno, GroupKind.GYM);
    const membros: string[] = [];
    for (const i of [1, 2, 3, 4, 5]) membros.push(await pessoa(`Membro ${i}`));
    await prisma.groupMembership.createMany({
      data: membros.map((userId) => ({
        groupId: id,
        userId,
        role: GroupRole.MEMBER,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
      })),
    });
    expect(await setup.firstSteps(u.bruno, id)).toEqual({
      active: false,
      activeMembers: 5,
      done: 2,
      total: 9,
    });
  });

  it('só o dono: a equipe recebe 403, quem é de fora 404, e a demo não tem', async () => {
    const id = await criar(u.bruno, GroupKind.GYM);
    await prisma.groupMembership.create({
      data: {
        groupId: id,
        userId: u.helena,
        role: GroupRole.ADMIN,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
      },
    });
    await expect(setup.get(u.helena, id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(setup.setStep(u.helena, id, SetupStep.PLAN, true)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(setup.get(u.outra, id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup.setGuide(u.outra, id, true)).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup.firstSteps(u.outra, id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup.firstSteps(u.helena, id)).rejects.toBeInstanceOf(NotFoundException);

    const demo = await prisma.group.create({
      data: {
        type: GroupType.SPONSORED,
        name: 'Academia Exemplo',
        slug: `${stamp}-demo`,
        ownerId: u.outra,
        isDemo: true,
        demoOwnerId: u.outra,
        memberships: {
          create: { userId: u.outra, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
        },
      },
    });
    grupos.push(demo.id);
    await expect(setup.get(u.outra, demo.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(setup.firstSteps(u.outra, demo.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('desafio sem push não avisa ninguém', async () => {
    const id = await criar(u.bruno, GroupKind.GYM);
    await prisma.groupMembership.create({
      data: {
        groupId: id,
        userId: u.aluna,
        role: GroupRole.MEMBER,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
      },
    });
    const hoje = todayInTz('America/Sao_Paulo');
    avisos.length = 0;
    await challenges.create(u.bruno, id, {
      title: 'Constância 30 dias',
      metric: ChallengeMetric.ACTIVE_DAYS,
      startDate: hoje,
      endDate: addDaysIso(hoje, 29),
      notify: false,
    });
    expect(avisos).toHaveLength(0);
    await challenges.create(u.bruno, id, {
      title: 'Treinos do mês',
      metric: ChallengeMetric.WORKOUT_SESSIONS,
      startDate: hoje,
      endDate: addDaysIso(hoje, 29),
    });
    expect(avisos.map((a) => a.to)).toEqual([[u.aluna]]);
  });

  it('a profissional recusa: quem convidou e o dono ficam sabendo', async () => {
    const id = await criar(u.bruno, GroupKind.GYM);
    const { url } = await invites.create(u.bruno, id, {
      role: GroupRole.PROFESSIONAL,
      email: `${stamp}-helena@test.local`,
    });
    const token = new URL(url).pathname.replace(/^\/c\//, '');
    avisos.length = 0;
    await invites.decline(u.helena, token);
    const recusa = avisos.find((a) => a.notice.title.startsWith('Convite recusado'));
    expect(recusa?.to).toEqual([u.bruno]);
    expect(recusa?.notice.body).toBe('Helena Souza recusou o convite para a equipe.');
    expect(recusa?.notice.url).toBe(`/org/${id}/team`);
  });
});
