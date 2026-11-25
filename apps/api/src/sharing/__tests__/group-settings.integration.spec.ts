import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GroupRole, GroupType, MembershipStatus } from '@fatia/db';
import { PrismaService } from '../../common/prisma.service';
import { silentNotifications } from '../../notifications/__tests__/silent-notifications';
import { MediaService } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import { GroupService } from '../group.service';
import { InviteService } from '../invite.service';
import { MembershipService } from '../membership.service';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGroupDto, UpdateGroupDto } from '../dto/group.dto';
import { ForYouService } from '../for-you.service';
import { ProfessionalLinkService } from '../professional-link.service';

/**
 * Configurações da comunidade (#413, Pn-15), contra Postgres real: a marca
 * (cor com contraste e capa), as seções escondidas, o tipo e o que é
 * obrigatório compartilhar.
 */
describe('configurações da comunidade (integração, #413)', () => {
  const prisma = new PrismaService();
  const store = new MemoryObjectStore();
  const media = new MediaService(prisma, store);
  const links = new ProfessionalLinkService(prisma);
  const groups = new GroupService(prisma, links, [], media);
  const forYou = new ForYouService(prisma);
  const memberships = new MembershipService(prisma, links, silentNotifications);
  const config = { get: () => undefined } as unknown as ConfigService;
  const invites = new InviteService(
    prisma,
    memberships,
    { send: async () => true } as never,
    config,
    silentNotifications,
    undefined,
    media,
  );

  const stamp = `t413s-${Date.now()}`;
  const usuarios: string[] = [];
  const grupos: string[] = [];
  const u = { dono: '', admin: '', aluna: '', donoB: '' };
  let grupo = '';
  let grupoB = '';

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

  async function imagem(groupId: string, uploaderId: string, purpose = 'group_cover') {
    return prisma.mediaFile.create({
      data: {
        groupId,
        uploaderId,
        purpose,
        kind: 'IMAGE',
        status: 'READY',
        key: `${stamp}/${Math.random().toString(36).slice(2)}.png`,
        mime: 'image/png',
        bytes: 10,
      },
    });
  }

  beforeAll(async () => {
    u.dono = await pessoa('Bruno Dono');
    u.admin = await pessoa('Rafael Admin');
    u.aluna = await pessoa('Ana Aluna');
    u.donoB = await pessoa('Dona B');
    const g = await prisma.group.create({
      data: {
        type: GroupType.SPONSORED,
        name: 'Academia 413',
        slug: `${stamp}-a`,
        ownerId: u.dono,
        memberships: {
          create: [
            { userId: u.dono, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
            { userId: u.admin, role: GroupRole.ADMIN, status: MembershipStatus.ACTIVE },
            { userId: u.aluna, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
          ],
        },
      },
    });
    grupo = g.id;
    const b = await prisma.group.create({
      data: {
        type: GroupType.SOCIAL,
        name: 'Comunidade B 413',
        slug: `${stamp}-b`,
        ownerId: u.donoB,
        memberships: {
          create: [{ userId: u.donoB, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE }],
        },
      },
    });
    grupoB = b.id;
    grupos.push(grupo, grupoB);
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.$disconnect();
  });

  describe('marca', () => {
    it('grava a cor normalizada e o membro a recebe no resumo', async () => {
      await groups.update(u.dono, grupo, { brandColor: '#1D4ED8' });
      const visto = await groups.findByIdForMember(u.aluna, grupo);
      expect(visto.brandColor).toBe('#1d4ed8');
    });

    it('recusa cor sem 4,5:1 com texto branco nem escuro, com a sugestão', async () => {
      const err = await groups.update(u.dono, grupo, { brandColor: '#7C5CFF' }).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as Error).message).toMatch(/#[0-9A-F]{6}/);
      expect((await groups.findByIdForMember(u.dono, grupo)).brandColor).toBe('#1d4ed8');
    });

    it('recusa o verde do Fatia', async () => {
      await expect(groups.update(u.dono, grupo, { brandColor: '#2CE500' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('null volta à cor padrão', async () => {
      await groups.update(u.dono, grupo, { brandColor: null });
      expect((await groups.findByIdForMember(u.aluna, grupo)).brandColor).toBeNull();
    });

    it('a capa entra só com arquivo desta comunidade, para este fim', async () => {
      const deB = await imagem(grupoB, u.donoB);
      await expect(groups.setCover(u.dono, grupo, deB.id)).rejects.toThrow(NotFoundException);
      const avatar = await imagem(grupo, u.dono, 'group_avatar');
      await expect(groups.setCover(u.dono, grupo, avatar.id)).rejects.toThrow(NotFoundException);

      const capa = await imagem(grupo, u.dono);
      const resumo = await groups.setCover(u.dono, grupo, capa.id);
      expect(resumo.coverUrl).toEqual(expect.any(String));
      expect((await groups.findByIdForMember(u.aluna, grupo)).coverUrl).toEqual(expect.any(String));
    });

    it('trocar a capa descarta a anterior; null tira', async () => {
      const antes = await prisma.group.findUniqueOrThrow({ where: { id: grupo } });
      const nova = await imagem(grupo, u.dono);
      await groups.setCover(u.dono, grupo, nova.id);
      expect(await prisma.mediaFile.findUnique({ where: { id: antes.coverFileId! } })).toBeNull();
      const sem = await groups.setCover(u.dono, grupo, null);
      expect(sem.coverUrl).toBeNull();
      expect(await prisma.mediaFile.findUnique({ where: { id: nova.id } })).toBeNull();
    });

    it('o membro não troca a capa', async () => {
      const capa = await imagem(grupo, u.dono);
      await expect(groups.setCover(u.aluna, grupo, capa.id)).rejects.toThrow(ForbiddenException);
      await expect(groups.setCover(u.donoB, grupo, capa.id)).rejects.toThrow(NotFoundException);
    });

    it('a capa sem uso não sobrevive à faxina, a capa em uso sim', async () => {
      const capa = await imagem(grupo, u.dono);
      await groups.setCover(u.dono, grupo, capa.id);
      const solta = await imagem(grupo, u.dono);
      await prisma.mediaFile.updateMany({
        where: { id: { in: [capa.id, solta.id] } },
        data: { createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      });
      await media.purgeOrphans(new Date());
      expect(await prisma.mediaFile.findUnique({ where: { id: capa.id } })).not.toBeNull();
      expect(await prisma.mediaFile.findUnique({ where: { id: solta.id } })).toBeNull();
    });

    it('o convite leva a cor e a capa', async () => {
      await groups.update(u.dono, grupo, { brandColor: '#1D4ED8' });
      const { url } = await invites.create(u.dono, grupo, { role: GroupRole.MEMBER });
      const preview = await invites.preview(url.split('/c/')[1]!);
      expect(preview.group.brandColor).toBe('#1d4ed8');
      expect(preview.group.coverUrl).toEqual(expect.any(String));
    });
  });

  describe('seções da comunidade', () => {
    it('grava sem repetir e devolve na ordem do enum, para todo membro', async () => {
      await groups.update(u.dono, grupo, {
        hiddenSections: ['FEED', 'NUTRITION_TIPS', 'FEED'],
      });
      const visto = await groups.findByIdForMember(u.aluna, grupo);
      expect(visto.hiddenSections).toEqual(['NUTRITION_TIPS', 'FEED']);
    });

    it('esconder não apaga nada nem tira a pessoa de lugar nenhum', async () => {
      const antes = await Promise.all([
        prisma.groupMembership.count({ where: { groupId: grupo, status: 'ACTIVE' } }),
        prisma.groupPost.count({ where: { groupId: grupo } }),
        prisma.groupChallenge.count({ where: { groupId: grupo } }),
        prisma.groupTip.count({ where: { groupId: grupo } }),
      ]);
      await groups.update(u.admin, grupo, {
        hiddenSections: ['NUTRITION_TIPS', 'NUTRITION_PLANS', 'CHALLENGES', 'FEED', 'AGENDA'],
      });
      const depois = await Promise.all([
        prisma.groupMembership.count({ where: { groupId: grupo, status: 'ACTIVE' } }),
        prisma.groupPost.count({ where: { groupId: grupo } }),
        prisma.groupChallenge.count({ where: { groupId: grupo } }),
        prisma.groupTip.count({ where: { groupId: grupo } }),
      ]);
      expect(depois).toEqual(antes);
      await groups.update(u.dono, grupo, { hiddenSections: [] });
      expect((await groups.findByIdForMember(u.aluna, grupo)).hiddenSections).toEqual([]);
    });

    it('planos alimentares e dicas de nutrição escondidos saem dos Recomendados de Para você', async () => {
      const agora = Date.now();
      await prisma.groupPlanTemplate.createMany({
        data: [
          {
            groupId: grupo,
            kind: 'NUTRITION',
            title: 'Cardápio escondido',
            snapshot: {},
            snapshotVersion: 1,
            publishedAt: new Date(agora),
          },
          {
            groupId: grupo,
            kind: 'WORKOUT',
            title: 'Treino visível',
            snapshot: {},
            snapshotVersion: 1,
            publishedAt: new Date(agora - 1000),
          },
        ],
      });
      await prisma.groupTip.createMany({
        data: [
          {
            groupId: grupo,
            title: 'Dica de nutrição escondida',
            body: 'x',
            category: 'NUTRITION',
            publishedAt: new Date(agora),
          },
          {
            groupId: grupo,
            title: 'Dica de treino visível',
            body: 'x',
            category: 'WORKOUT',
            publishedAt: new Date(agora - 1000),
          },
        ],
      });
      try {
        await groups.update(u.dono, grupo, {
          hiddenSections: ['NUTRITION_PLANS', 'NUTRITION_TIPS'],
        });
        const titulos = (await forYou.get(u.aluna, grupo)).recommended.map((r) => r.title);
        expect(titulos).toContain('Treino visível');
        expect(titulos).toContain('Dica de treino visível');
        expect(titulos).not.toContain('Cardápio escondido');
        expect(titulos).not.toContain('Dica de nutrição escondida');
      } finally {
        await groups.update(u.dono, grupo, { hiddenSections: [] });
        await prisma.groupPlanTemplate.deleteMany({ where: { groupId: grupo } });
        await prisma.groupTip.deleteMany({ where: { groupId: grupo } });
      }
    });

    it('o membro não esconde seção', async () => {
      await expect(groups.update(u.aluna, grupo, { hiddenSections: ['FEED'] })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('tipo', () => {
    it('só o dono muda o tipo', async () => {
      await expect(groups.update(u.admin, grupo, { type: GroupType.SOCIAL })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('patrocinada com assentos valendo não vira social', async () => {
      await prisma.groupSeatPool.create({
        data: { groupId: grupo, seats: 5, unitPriceCents: 1490, status: 'ACTIVE' },
      });
      await expect(groups.update(u.dono, grupo, { type: GroupType.SOCIAL })).rejects.toThrow(
        ConflictException,
      );
      await prisma.groupSeatPool.update({
        where: { groupId: grupo },
        data: { status: 'CANCELED', canceledAt: new Date() },
      });
      const g = await groups.update(u.dono, grupo, { type: GroupType.SOCIAL });
      expect(g.type).toBe(GroupType.SOCIAL);
      await groups.update(u.dono, grupo, { type: GroupType.SPONSORED });
    });
  });

  describe('o que o membro precisa compartilhar', () => {
    it('fotos das refeições nunca é obrigatória', async () => {
      await expect(
        groups.update(u.dono, grupo, { requiredSharingScopes: ['WORKOUT', 'MEAL_PHOTOS'] }),
      ).rejects.toThrow(BadRequestException);
      const g = await groups.update(u.dono, grupo, { requiredSharingScopes: ['WORKOUT'] });
      expect(g.requiredSharingScopes).toEqual(['WORKOUT']);
    });

    it('nem ao criar a comunidade (o service e o DTO recusam)', async () => {
      await expect(
        groups.create(u.dono, {
          type: GroupType.SOCIAL,
          name: 'Com foto obrigatória',
          slug: `${stamp}-foto`,
          requiredSharingScopes: ['WORKOUT', 'MEAL_PHOTOS'],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(await prisma.group.count({ where: { slug: `${stamp}-foto` } })).toBe(0);
      const corpo = { type: 'SOCIAL', name: 'Comunidade', requiredSharingScopes: ['MEAL_PHOTOS'] };
      const naCriacao = await validate(plainToInstance(CreateGroupDto, corpo));
      expect(naCriacao.map((e) => e.property)).toContain('requiredSharingScopes');
      const naEdicao = await validate(plainToInstance(UpdateGroupDto, corpo));
      expect(naEdicao.map((e) => e.property)).toContain('requiredSharingScopes');
    });

    it('a migration tira fotos das refeições das comunidades que já a exigiam', async () => {
      const dir = join(__dirname, '../../../../../packages/db/prisma/migrations');
      const pasta = readdirSync(dir).find((d) => d.endsWith('_meal_photos_never_required'));
      expect(pasta).toBeDefined();
      const sql = readFileSync(join(dir, pasta!, 'migration.sql'), 'utf8');
      await prisma.group.update({
        where: { id: grupoB },
        data: { requiredSharingScopes: ['WORKOUT', 'MEAL_PHOTOS'] },
      });
      await prisma.$executeRawUnsafe(sql);
      const b = await prisma.group.findUniqueOrThrow({ where: { id: grupoB } });
      expect(b.requiredSharingScopes).toEqual(['WORKOUT']);
      await prisma.group.update({ where: { id: grupoB }, data: { requiredSharingScopes: [] } });
    });
  });
});
