import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { MediaService, ORPHAN_AFTER_MS, type MediaPurpose } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import { GroupAgentService } from '../group-agent.service';
import { GroupService } from '../group.service';
import { ProfessionalLinkService } from '../professional-link.service';

/** PNG 1×1 válido: o `sharp` precisa de imagem de verdade para confirmar. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * O agente da comunidade (Fase 7c, ADR 031) no Postgres real: quem configura,
 * quem pode escolher, o padrão do assento e o que acontece quando a pessoa sai
 * ou a comunidade some.
 */
describe('agente da comunidade (integração)', () => {
  const prisma = new PrismaService();
  const store = new MemoryObjectStore();
  const media = new MediaService(prisma, store);
  const agents = new GroupAgentService(prisma, media);
  const groups = new GroupService(prisma, new ProfessionalLinkService(prisma), [], media);

  const stamp = `agente-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;

  async function pessoa(nome = 'Pessoa') {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: `${nome} ${n}` },
    });
    criados.push(user.id);
    return user.id;
  }

  async function entra(groupId: string, role: 'MEMBER' | 'PROFESSIONAL', userId?: string) {
    const id = userId ?? (await pessoa(role));
    await prisma.groupMembership.create({
      data: { groupId, userId: id, role, status: 'ACTIVE', joinedAt: new Date() },
    });
    return id;
  }

  async function comunidade(nome = 'Academia') {
    const dono = await pessoa('Dona');
    const g = await groups.create(dono, { type: 'SPONSORED', name: nome });
    grupos.push(g.id);
    return {
      groupId: g.id,
      dono,
      prof: await entra(g.id, 'PROFESSIONAL'),
      membro: await entra(g.id, 'MEMBER'),
    };
  }

  async function envia(userId: string, groupId: string, purpose: MediaPurpose) {
    const r = await media.requestUpload(userId, {
      purpose,
      groupId,
      mime: 'image/png',
      bytes: PNG.length,
    });
    const f = await prisma.mediaFile.findUniqueOrThrow({ where: { id: r.fileId } });
    store.upload(f.key, PNG, 'image/png');
    await media.confirm(userId, r.fileId);
    return r.fileId;
  }

  const ligado = { name: 'Treinador', instructions: 'Fale de treino de força.', enabled: true };

  afterAll(async () => {
    await prisma.conversation.deleteMany({ where: { userId: { in: criados } } });
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  describe('configuração', () => {
    it('o dono salva e lê; profissional e membro não; quem é de fora nem vê a comunidade', async () => {
      const a = await comunidade();
      const estranho = await pessoa('Estranho');

      expect(await agents.get(a.dono, a.groupId)).toMatchObject({ configured: false });
      const salvo = await agents.put(a.dono, a.groupId, { ...ligado, name: '  Treinador  ' });
      expect(salvo).toMatchObject({ configured: true, name: 'Treinador', enabled: true });

      for (const quem of [a.prof, a.membro]) {
        await expect(agents.get(quem, a.groupId)).rejects.toBeInstanceOf(ForbiddenException);
        await expect(agents.put(quem, a.groupId, ligado)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
      }
      await expect(agents.put(estranho, a.groupId, ligado)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('o avatar é desta comunidade e enviado como avatar do agente; trocar apaga o anterior', async () => {
      const a = await comunidade();
      const b = await comunidade('Outra');
      const deOutra = await envia(b.dono, b.groupId, 'agent_avatar');
      const capa = await envia(a.dono, a.groupId, 'group_content');

      await expect(
        agents.put(a.dono, a.groupId, { ...ligado, avatarFileId: deOutra }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        agents.put(a.dono, a.groupId, { ...ligado, avatarFileId: capa }),
      ).rejects.toBeInstanceOf(NotFoundException);

      const primeiro = await envia(a.dono, a.groupId, 'agent_avatar');
      const com = await agents.put(a.dono, a.groupId, { ...ligado, avatarFileId: primeiro });
      expect(com.avatar?.id).toBe(primeiro);
      // Ausente mantém.
      expect((await agents.put(a.dono, a.groupId, ligado)).avatar?.id).toBe(primeiro);

      const chave = (await prisma.mediaFile.findUniqueOrThrow({ where: { id: primeiro } })).key;
      const segundo = await envia(a.dono, a.groupId, 'agent_avatar');
      await agents.put(a.dono, a.groupId, { ...ligado, avatarFileId: segundo });
      expect(await prisma.mediaFile.findUnique({ where: { id: primeiro } })).toBeNull();
      expect(await store.head(chave)).toBeNull();
    });

    it('a faxina não leva o avatar em uso', async () => {
      const a = await comunidade();
      const avatar = await envia(a.dono, a.groupId, 'agent_avatar');
      await agents.put(a.dono, a.groupId, { ...ligado, avatarFileId: avatar });

      // Envelhece só o arquivo deste teste: adiantar o relógio da faxina levaria
      // os envios recentes das outras suítes que rodam ao mesmo tempo.
      await prisma.mediaFile.update({
        where: { id: avatar },
        data: { createdAt: new Date(Date.now() - ORPHAN_AFTER_MS - 60_000) },
      });
      await media.purgeOrphans(new Date());
      expect(await prisma.mediaFile.findUnique({ where: { id: avatar } })).not.toBeNull();
    });
  });

  describe('no chat', () => {
    it('lista só os agentes ligados das comunidades em que a pessoa está ativa', async () => {
      const a = await comunidade('Academia A');
      const b = await comunidade('Academia B');
      const c = await comunidade('Academia C');
      const pessoaX = await entra(a.groupId, 'MEMBER');
      await entra(b.groupId, 'MEMBER', pessoaX);
      await prisma.groupMembership.create({
        data: { groupId: c.groupId, userId: pessoaX, role: 'MEMBER', status: 'INVITED' },
      });
      await agents.put(a.dono, a.groupId, { ...ligado, name: 'Agente A' });
      await agents.put(b.dono, b.groupId, { ...ligado, name: 'Agente B', enabled: false });
      await agents.put(c.dono, c.groupId, { ...ligado, name: 'Agente C' });

      const lista = await agents.listForChat(pessoaX, null);
      expect(lista.agents.map((x) => x.name)).toEqual(['Agente A']);
      expect(lista.defaultGroupId).toBeNull();
      await expect(agents.assertSelectable(pessoaX, b.groupId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(agents.assertSelectable(pessoaX, c.groupId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('o padrão é a comunidade do assento, só com o agente dela ligado', async () => {
      const a = await comunidade();
      await agents.put(a.dono, a.groupId, ligado);
      expect((await agents.listForChat(a.membro, a.groupId)).defaultGroupId).toBe(a.groupId);

      await agents.put(a.dono, a.groupId, { ...ligado, enabled: false });
      expect((await agents.listForChat(a.membro, a.groupId)).defaultGroupId).toBeNull();
    });

    it('sem avatar próprio, o agente usa o da comunidade', async () => {
      const a = await comunidade();
      const avatarDaComunidade = await envia(a.dono, a.groupId, 'group_avatar');
      await groups.setAvatar(a.dono, a.groupId, avatarDaComunidade);
      await agents.put(a.dono, a.groupId, ligado);

      const [opcao] = (await agents.listForChat(a.membro, null)).agents;
      const chave = (
        await prisma.mediaFile.findUniqueOrThrow({ where: { id: avatarDaComunidade } })
      ).key;
      expect(opcao.avatarUrl).toContain(chave);
    });

    it('quem sai da comunidade perde a persona; o membro ativo recebe as orientações', async () => {
      const a = await comunidade('Studio Norte');
      await agents.put(a.dono, a.groupId, ligado);

      expect(await agents.personaFor(a.membro, a.groupId)).toEqual({
        groupId: a.groupId,
        name: 'Treinador',
        community: 'Studio Norte',
        instructions: 'Fale de treino de força.',
      });
      await prisma.groupMembership.update({
        where: { groupId_userId: { groupId: a.groupId, userId: a.membro } },
        data: { status: 'LEFT' },
      });
      expect(await agents.personaFor(a.membro, a.groupId)).toBeNull();
      expect(await agents.headerFor(a.membro, a.groupId)).toBeNull();
    });

    it('apagar a comunidade leva o agente e devolve a conversa ao assistente da Fatia', async () => {
      const a = await comunidade();
      await agents.put(a.dono, a.groupId, ligado);
      const conversa = await prisma.conversation.create({
        data: { userId: a.membro, title: 'treino', agentGroupId: a.groupId },
      });

      await groups.remove(a.dono, a.groupId);

      expect(await prisma.groupAgent.findUnique({ where: { groupId: a.groupId } })).toBeNull();
      expect(
        await prisma.conversation.findUniqueOrThrow({ where: { id: conversa.id } }),
      ).toMatchObject({ agentGroupId: null, title: 'treino' });
    });
  });
});
