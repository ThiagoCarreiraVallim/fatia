import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JoinPolicy } from '@fatia/db';
import { PrismaService } from '../../common/prisma.service';
import type { EmailMessage, EmailService } from '../../notifications/email.service';
import { ConsentService } from '../consent.service';
import { GroupService } from '../group.service';
import { InviteService, hashInviteToken } from '../invite.service';
import { MembershipService } from '../membership.service';
import { ProfessionalLinkService } from '../professional-link.service';

/**
 * Comunidade de ponta a ponta no Postgres real (Fase 5, ADR 026): convite,
 * política de entrada, consentimento à equipe nos dois sentidos e
 * transferência. Real porque cada afirmação é sobre linhas que nascem ou morrem
 * no mesmo commit — um dublê de Prisma aceitaria qualquer transação.
 */
describe('comunidade (integração)', () => {
  const prisma = new PrismaService();
  const links = new ProfessionalLinkService(prisma);
  const memberships = new MembershipService(prisma, links);
  const consent = new ConsentService(prisma, links);
  const enviados: EmailMessage[] = [];
  const email = {
    send: async (m: EmailMessage) => {
      enviados.push(m);
      return true;
    },
  } as unknown as EmailService;
  const config = { get: () => 'https://fatia.test/' } as unknown as ConfigService;
  const invites = new InviteService(prisma, memberships, email, config);
  const ganchos: string[] = [];
  const groups = new GroupService(prisma, links, [
    { antesDeApagar: async (id: string) => void ganchos.push(id) },
  ]);

  const stamp = `comunidade-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;

  async function pessoa(nome: string, emailDela?: string) {
    n += 1;
    const user = await prisma.user.create({
      data: {
        logtoSub: `${stamp}-${n}`,
        email: emailDela ?? `${stamp}-${n}@test.local`,
        name: nome,
      },
    });
    criados.push(user.id);
    return user.id;
  }

  /** Dono + profissional ativos, numa comunidade com a política pedida. */
  async function comunidade(joinPolicy: JoinPolicy = 'APPROVAL') {
    const dono = await pessoa('Dona');
    const grupo = await groups.create(dono, { type: 'SPONSORED', name: 'Academia', joinPolicy });
    grupos.push(grupo.id);
    const pro = await pessoa('Pro');
    await prisma.groupMembership.create({
      data: { groupId: grupo.id, userId: pro, role: 'PROFESSIONAL', status: 'ACTIVE' },
    });
    return { dono, pro, grupo };
  }

  const vivos = (groupId: string) =>
    prisma.professionalLink.findMany({
      where: { groupId, revokedAt: null },
      select: { subjectUserId: true, professionalId: true, scopes: true },
    });

  const token = (url: string) => url.split('/c/')[1];

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  describe('convite', () => {
    it('o link mostra a comunidade e quem aceita entra na hora, com o que escolheu compartilhar', async () => {
      const { dono, pro, grupo } = await comunidade();
      const { url, invite } = await invites.create(dono, grupo.id, { role: 'MEMBER' });
      expect(url).toMatch(/^https:\/\/fatia\.test\/c\/[A-Za-z0-9_-]{43}$/);
      // O banco guarda o hash, nunca o token.
      const linha = await prisma.groupInvite.findUniqueOrThrow({ where: { id: invite.id } });
      expect(linha.tokenHash).toBe(hashInviteToken(token(url)));
      expect(JSON.stringify(linha)).not.toContain(token(url));

      const cartao = await invites.preview(token(url));
      expect(cartao.group.name).toBe('Academia');
      expect(cartao.invitedBy).toBe('Dona');
      expect(cartao.team.map((m) => m.role).sort()).toEqual(['OWNER', 'PROFESSIONAL']);

      const aluna = await pessoa('Aluna');
      const resultado = await invites.accept(aluna, token(url), {
        scopes: ['WORKOUT', 'HABITS'],
        statsOptIn: true,
      });
      expect(resultado).toMatchObject({ status: 'ACTIVE', role: 'MEMBER', groupId: grupo.id });

      const membership = await prisma.groupMembership.findUniqueOrThrow({
        where: { groupId_userId: { groupId: grupo.id, userId: aluna } },
      });
      expect(membership.consentScopes.sort()).toEqual(['HABITS', 'WORKOUT']);
      expect(membership.statsOptIn).toBe(true);
      expect(membership.consentAt).not.toBeNull();

      const vinculos = await vivos(grupo.id);
      expect(vinculos.map((v) => [v.subjectUserId, v.professionalId]).sort()).toEqual(
        [
          [aluna, dono],
          [aluna, pro],
        ].sort(),
      );
      expect(
        await prisma.groupInvite.findUniqueOrThrow({ where: { id: invite.id } }),
      ).toMatchObject({
        uses: 1,
      });
    });

    it('recusar tudo também entra, e não cria vínculo nenhum', async () => {
      const { dono, grupo } = await comunidade();
      const { url } = await invites.create(dono, grupo.id, { role: 'MEMBER' });
      const aluno = await pessoa('Aluno');
      await invites.accept(aluno, token(url), { scopes: [], statsOptIn: false });
      expect(await vivos(grupo.id)).toEqual([]);
    });

    it('quem entra pela equipe recebe o vínculo de quem já tinha consentido', async () => {
      const { dono, grupo } = await comunidade();
      const aluna = await pessoa('Aluna');
      const link = await invites.create(dono, grupo.id, { role: 'MEMBER' });
      await invites.accept(aluna, token(link.url), { scopes: ['NUTRITION'], statsOptIn: false });

      const { url } = await invites.create(dono, grupo.id, { role: 'CREATOR' });
      const criadora = await pessoa('Criadora');
      await invites.accept(criadora, token(url), { scopes: [], statsOptIn: false });

      const paraCriadora = (await vivos(grupo.id)).filter((v) => v.professionalId === criadora);
      expect(paraCriadora).toEqual([
        { subjectUserId: aluna, professionalId: criadora, scopes: ['NUTRITION'] },
      ]);
    });

    it('profissional convida só membro, e membro não convida', async () => {
      const { dono, pro, grupo } = await comunidade();
      await expect(invites.create(pro, grupo.id, { role: 'PROFESSIONAL' })).rejects.toThrow(
        ForbiddenException,
      );
      await expect(invites.create(pro, grupo.id, { role: 'MEMBER' })).resolves.toBeDefined();

      const { url } = await invites.create(dono, grupo.id, { role: 'MEMBER' });
      const aluno = await pessoa('Aluno');
      await invites.accept(aluno, token(url), { scopes: [], statsOptIn: false });
      await expect(invites.create(aluno, grupo.id, { role: 'MEMBER' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('convite por e-mail vale só para aquela conta, uma vez, e o e-mail leva o link', async () => {
      const { dono, grupo } = await comunidade();
      const destino = `${stamp}-convidada@test.local`;
      const criado = await invites.create(dono, grupo.id, {
        role: 'MEMBER',
        email: destino.toUpperCase(),
      });
      expect(criado.emailSent).toBe(true);
      expect(criado.invite.maxUses).toBe(1);
      const mensagem = enviados.find((m) => m.to === destino);
      expect(mensagem?.text).toContain(criado.url);

      const intrusa = await pessoa('Intrusa');
      await expect(
        invites.accept(intrusa, token(criado.url), { scopes: ['BODY'], statsOptIn: false }),
      ).rejects.toThrow(NotFoundException);

      const convidada = await pessoa('Convidada', destino);
      await invites.accept(convidada, token(criado.url), { scopes: [], statsOptIn: false });
      // Esgotado: o mesmo 404 de um convite que nunca existiu.
      await expect(invites.preview(token(criado.url))).rejects.toThrow(NotFoundException);
    });

    it('revogado, vencido ou de outra comunidade: 404, sem dizer qual', async () => {
      const a = await comunidade();
      const b = await comunidade();
      const revogado = await invites.create(a.dono, a.grupo.id, { role: 'MEMBER' });
      await invites.revoke(a.dono, a.grupo.id, revogado.invite.id);
      await expect(invites.preview(token(revogado.url))).rejects.toThrow(NotFoundException);

      const vencido = await invites.create(a.dono, a.grupo.id, { role: 'MEMBER' });
      await prisma.groupInvite.update({
        where: { id: vencido.invite.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expect(invites.preview(token(vencido.url))).rejects.toThrow(NotFoundException);

      // O dono de B não revoga nem lista convite de A.
      const deA = await invites.create(a.dono, a.grupo.id, { role: 'MEMBER' });
      await expect(invites.revoke(b.dono, b.grupo.id, deA.invite.id)).rejects.toThrow(
        NotFoundException,
      );
      await expect(invites.revoke(b.dono, a.grupo.id, deA.invite.id)).rejects.toThrow(
        NotFoundException,
      );
      expect((await invites.list(b.dono, b.grupo.id)).map((i) => i.id)).not.toContain(
        deA.invite.id,
      );
    });

    it('quem já está dentro recebe 409 com o grupo, e o convite não é gasto', async () => {
      const { dono, pro, grupo } = await comunidade();
      const { url, invite } = await invites.create(dono, grupo.id, { role: 'MEMBER' });
      const erro = await invites
        .accept(pro, token(url), { scopes: [], statsOptIn: false })
        .catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ConflictException);
      expect((erro as ConflictException).getResponse()).toMatchObject({ groupId: grupo.id });
      expect((await prisma.groupInvite.findUniqueOrThrow({ where: { id: invite.id } })).uses).toBe(
        0,
      );
    });

    it('pedido pendente aceito por convite vira ativo', async () => {
      const { dono, grupo } = await comunidade('APPROVAL');
      const aluno = await pessoa('Aluno');
      await memberships.requestJoin(aluno, grupo.slug);
      const { url } = await invites.create(dono, grupo.id, { role: 'MEMBER' });
      await expect(
        invites.accept(aluno, token(url), { scopes: [], statsOptIn: false }),
      ).resolves.toMatchObject({ status: 'ACTIVE' });
    });
  });

  describe('entrada pelo código', () => {
    it('OPEN entra na hora com os vínculos escolhidos', async () => {
      const { dono, pro, grupo } = await comunidade('OPEN');
      const aluna = await pessoa('Aluna');
      await expect(
        memberships.requestJoin(aluna, grupo.slug, { scopes: ['GOALS'], statsOptIn: false }),
      ).resolves.toMatchObject({ status: 'ACTIVE', role: 'MEMBER' });
      expect((await vivos(grupo.id)).map((v) => v.professionalId).sort()).toEqual(
        [dono, pro].sort(),
      );
    });

    it('APPROVAL guarda a escolha e só cria os vínculos na aprovação', async () => {
      const { dono, grupo } = await comunidade('APPROVAL');
      const aluna = await pessoa('Aluna');
      const pedido = await memberships.requestJoin(aluna, grupo.slug, {
        scopes: ['BODY'],
        statsOptIn: true,
      });
      expect(pedido.status).toBe('INVITED');
      expect(await vivos(grupo.id)).toEqual([]);

      await memberships.approve(dono, grupo.id, pedido.membershipId);
      expect((await vivos(grupo.id)).every((v) => v.subjectUserId === aluna)).toBe(true);
      expect((await vivos(grupo.id)).length).toBe(2);
    });

    it('INVITE_ONLY responde como se a comunidade não existisse', async () => {
      const { grupo } = await comunidade('INVITE_ONLY');
      const aluno = await pessoa('Aluno');
      await expect(memberships.requestJoin(aluno, grupo.slug)).rejects.toThrow(NotFoundException);
      await expect(groups.previewBySlug(grupo.slug)).rejects.toThrow(NotFoundException);
    });
  });

  describe('o que compartilho com a comunidade', () => {
    it('substitui os vínculos daquele grupo, e lista vazia revoga todos', async () => {
      const { dono, pro, grupo } = await comunidade('OPEN');
      const aluna = await pessoa('Aluna');
      await memberships.requestJoin(aluna, grupo.slug, { scopes: ['WORKOUT'], statsOptIn: false });

      await consent.setGroupConsent(aluna, grupo.id, {
        scopes: ['NUTRITION', 'BODY'],
        statsOptIn: true,
      });
      const agora = await vivos(grupo.id);
      expect(agora.map((v) => v.professionalId).sort()).toEqual([dono, pro].sort());
      expect(agora.every((v) => [...v.scopes].sort().join() === 'BODY,NUTRITION')).toBe(true);

      await consent.setGroupConsent(aluna, grupo.id, { scopes: [], statsOptIn: false });
      expect(await vivos(grupo.id)).toEqual([]);
      // Revogar data a linha, não apaga: o histórico responde quem viu o quê.
      expect(
        await prisma.professionalLink.count({
          where: { groupId: grupo.id, subjectUserId: aluna, revokedAt: { not: null } },
        }),
      ).toBeGreaterThan(0);
    });

    it('só a própria membership ativa: pendente e estranho recebem 404', async () => {
      const { grupo } = await comunidade('APPROVAL');
      const pendente = await pessoa('Pendente');
      await memberships.requestJoin(pendente, grupo.slug);
      const estranho = await pessoa('Estranho');
      for (const quem of [pendente, estranho]) {
        await expect(
          consent.setGroupConsent(quem, grupo.id, { scopes: ['WORKOUT'], statsOptIn: false }),
        ).rejects.toThrow(NotFoundException);
      }
      expect(await vivos(grupo.id)).toEqual([]);
    });
  });

  describe('dono', () => {
    it('transfere para um membro, que passa a receber o que os outros consentiram', async () => {
      const { dono, grupo } = await comunidade('OPEN');
      const aluna = await pessoa('Aluna');
      await memberships.requestJoin(aluna, grupo.slug, { scopes: ['HABITS'], statsOptIn: false });
      const novo = await pessoa('Novo dono');
      const entrada = await memberships.requestJoin(novo, grupo.slug);

      await groups.transferOwnership(dono, grupo.id, entrada.membershipId);

      const papeis = await prisma.groupMembership.findMany({
        where: { groupId: grupo.id, userId: { in: [dono, novo] } },
        select: { userId: true, role: true },
      });
      expect(Object.fromEntries(papeis.map((p) => [p.userId, p.role]))).toEqual({
        [dono]: 'PROFESSIONAL',
        [novo]: 'OWNER',
      });
      expect((await prisma.group.findUniqueOrThrow({ where: { id: grupo.id } })).ownerId).toBe(
        novo,
      );
      expect(
        (await vivos(grupo.id))
          .filter((v) => v.professionalId === novo)
          .map((v) => v.subjectUserId),
      ).toEqual([aluna]);
    });

    it('só o dono transfere, edita e apaga; e o alvo tem de ser membro ativo dali', async () => {
      const a = await comunidade();
      const b = await comunidade();
      const deB = await prisma.groupMembership.findFirstOrThrow({
        where: { groupId: b.grupo.id, userId: b.pro },
      });
      await expect(groups.transferOwnership(a.dono, a.grupo.id, deB.id)).rejects.toThrow(
        NotFoundException,
      );
      const proDeA = await prisma.groupMembership.findFirstOrThrow({
        where: { groupId: a.grupo.id, userId: a.pro },
      });
      await expect(groups.transferOwnership(a.pro, a.grupo.id, proDeA.id)).rejects.toThrow(
        NotFoundException,
      );
      await expect(groups.update(a.pro, a.grupo.id, { name: 'Tomada' })).rejects.toThrow(
        NotFoundException,
      );
      await expect(groups.remove(a.pro, a.grupo.id)).rejects.toThrow(NotFoundException);

      await expect(
        groups.update(a.dono, a.grupo.id, { name: 'Academia Nova', joinPolicy: 'OPEN' }),
      ).resolves.toMatchObject({ name: 'Academia Nova', joinPolicy: 'OPEN' });
    });

    it('apagar chama os ganchos antes e leva convites e vínculos junto', async () => {
      const { dono, grupo } = await comunidade('OPEN');
      await invites.create(dono, grupo.id, { role: 'MEMBER' });
      const aluna = await pessoa('Aluna');
      await memberships.requestJoin(aluna, grupo.slug, { scopes: ['WORKOUT'], statsOptIn: false });

      await groups.remove(dono, grupo.id);
      expect(ganchos).toContain(grupo.id);
      expect(await prisma.groupInvite.count({ where: { groupId: grupo.id } })).toBe(0);
      expect(await prisma.professionalLink.count({ where: { groupId: grupo.id } })).toBe(0);
    });
  });
});
