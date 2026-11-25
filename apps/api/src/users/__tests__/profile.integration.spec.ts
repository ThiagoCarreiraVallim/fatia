import { BadRequestException, GoneException, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../../common/prisma.service';
import type { LogtoManagementService } from '../../auth/logto-management.service';
import type { CheckpointPurgeService } from '../../chat/checkpoint-purge.service';
import { MediaService } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import { GroupService } from '../../sharing/group.service';
import { PostService } from '../../sharing/post.service';
import { ProfessionalLinkService } from '../../sharing/professional-link.service';
import { silentNotifications } from '../../notifications/__tests__/silent-notifications';
import { TUTORIALS_SEEN_MAX, YouService } from '../../you/you.service';
import { NEWS } from '../../you/news-catalog';
import { AccountService, APP_DELETE_CONFIRMATION, DELETE_CONFIRMATION } from '../account.service';
import {
  DataExportService,
  EXPORT_LINK_REDOWNLOAD_MS,
  EXPORT_LINK_TTL_MS,
} from '../data-export.service';
import { ProfileService } from '../profile.service';

/**
 * Você (#387) no Postgres real: a foto de perfil (EXIF fora, só a própria
 * pessoa troca, visibilidade no mural), apelido, bio, WhatsApp e unidades, o
 * link de exportação de 24 h, a exclusão com "APAGAR", as novidades e os
 * tutoriais.
 */
describe('Você: perfil, conta e novidades (integração)', () => {
  const prisma = new PrismaService();
  const store = new MemoryObjectStore();
  const media = new MediaService(prisma, store);
  const profile = new ProfileService(prisma, media);
  const you = new YouService(prisma);
  const account = new AccountService(
    prisma,
    { deleteUser: async () => true } as unknown as LogtoManagementService,
    { apagarDoUsuario: async () => undefined } as unknown as CheckpointPurgeService,
    [{ beforeDelete: (userId: string) => media.beforeDeleteAccount(userId) }],
  );
  const exports = new DataExportService(prisma, account);
  const posts = new PostService(prisma, media, silentNotifications);
  const groups = new GroupService(prisma, new ProfessionalLinkService(prisma), [], media);

  const stamp = `voce-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;

  async function pessoa(nome = 'Ana Demo') {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: nome },
    });
    criados.push(user.id);
    return user.id;
  }

  /** JPEG com EXIF de câmera e GPS, como sai do celular. */
  async function jpegComExif(): Promise<Buffer> {
    return sharp({ create: { width: 40, height: 30, channels: 3, background: '#ff7a1a' } })
      .jpeg()
      .withExif({ IFD0: { Make: 'Fatia', Model: 'Celular' }, IFD3: { GPSLatitudeRef: 'S' } })
      .toBuffer();
  }

  async function enviaFoto(userId: string, groupId?: string): Promise<string> {
    const corpo = await jpegComExif();
    const t = await media.requestUpload(userId, {
      purpose: 'user_avatar',
      groupId,
      mime: 'image/jpeg',
      bytes: corpo.length,
    });
    const f = await prisma.mediaFile.findUniqueOrThrow({ where: { id: t.fileId } });
    store.upload(f.key, corpo, 'image/jpeg');
    return t.fileId;
  }

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  describe('foto de perfil', () => {
    it('o perfil diz se o envio de foto está disponível', async () => {
      const id = await pessoa();
      expect((await profile.getMe(id)).mediaUploadEnabled).toBe(true);
      const semBucket = new ProfileService(prisma, new MediaService(prisma, null));
      expect((await semBucket.getMe(id)).mediaUploadEnabled).toBe(false);
    });

    it('diz se o nome ainda é provisório (o sub ou o pedaço do e-mail), sem expor o sub', async () => {
      const real = await pessoa('Ana Souza');
      expect((await profile.getMe(real)).nameIsProvisional).toBe(false);
      const sub = await pessoa('x');
      const row = await prisma.user.update({
        where: { id: sub },
        data: { name: `${stamp}-${n}` },
      });
      const me = await profile.getMe(sub);
      expect(row.name).toBe(row.logtoSub);
      expect(me.nameIsProvisional).toBe(true);
      expect(me).not.toHaveProperty('logtoSub');
    });

    it('toda resposta de perfil diz se a troca de e-mail existe (também a da foto)', async () => {
      const id = await pessoa();
      const comM2m = new ProfileService(prisma, media, {
        get: (k: string) => ({ LOGTO_M2M_APP_ID: 'm2m', LOGTO_M2M_APP_SECRET: 's' })[k],
      } as never);
      expect((await comM2m.getMe(id)).emailChangeEnabled).toBe(true);
      const fileId = await enviaFoto(id);
      // A tela grava a resposta da foto no cache do perfil: sem o campo, o
      // "Trocar e-mail" sumia depois de trocar a foto.
      expect((await comM2m.setAvatar(id, fileId)).emailChangeEnabled).toBe(true);
      expect((await comM2m.removeAvatar(id)).emailChangeEnabled).toBe(true);
      expect((await profile.getMe(id)).emailChangeEnabled).toBe(false);
    });

    it('sai sem EXIF, em WebP, guardada como arquivo pessoal', async () => {
      const ana = await pessoa();
      // O que chega tem EXIF: sem isto, o teste passaria com qualquer imagem.
      expect((await sharp(await jpegComExif()).metadata()).exif).toBeDefined();
      const fileId = await enviaFoto(ana);
      const me = await profile.setAvatar(ana, fileId);

      expect(me.avatarUrl).toEqual(expect.any(String));
      const f = await prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } });
      expect(f).toMatchObject({ groupId: null, purpose: 'user_avatar', mime: 'image/webp' });
      expect(f.key).toBe(`users/${ana}/${fileId}.webp`);
      const meta = await sharp(store.objects.get(f.key)!.body).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
    });

    it('ignora a comunidade que vier no pedido: a foto continua pessoal', async () => {
      const ana = await pessoa();
      const g = await groups.create(ana, { type: 'SOCIAL', name: 'Corrida' });
      grupos.push(g.id);
      const fileId = await enviaFoto(ana, g.id);
      const f = await prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } });
      expect(f.groupId).toBeNull();
    });

    it('trocar apaga a foto anterior do bucket; remover volta às iniciais', async () => {
      const ana = await pessoa();
      const primeira = await enviaFoto(ana);
      await profile.setAvatar(ana, primeira);
      const chave = (await prisma.mediaFile.findUniqueOrThrow({ where: { id: primeira } })).key;

      await profile.setAvatar(ana, await enviaFoto(ana));
      expect(await prisma.mediaFile.findUnique({ where: { id: primeira } })).toBeNull();
      expect(store.objects.get(chave)).toBeUndefined();

      const me = await profile.removeAvatar(ana);
      expect(me.avatarUrl).toBeNull();
      expect(await prisma.mediaFile.count({ where: { uploaderId: ana } })).toBe(0);
    });

    it('a foto de outra pessoa não vira a minha', async () => {
      const ana = await pessoa();
      const bia = await pessoa('Bia');
      const daAna = await enviaFoto(ana);
      await expect(profile.setAvatar(bia, daAna)).rejects.toBeInstanceOf(NotFoundException);
      expect((await profile.getMe(bia)).avatarUrl).toBeNull();
    });

    it('no mural, "Só a equipe" mostra iniciais aos membros e a foto à equipe e à dona', async () => {
      const dona = await pessoa('Dona');
      const g = await groups.create(dona, { type: 'SPONSORED', name: 'Academia' });
      grupos.push(g.id);
      const ana = await pessoa('Ana Demo');
      const colega = await pessoa('Colega');
      for (const id of [ana, colega]) {
        await prisma.groupMembership.create({
          data: {
            groupId: g.id,
            userId: id,
            role: 'MEMBER',
            status: 'ACTIVE',
            joinedAt: new Date(),
          },
        });
      }
      await profile.setAvatar(ana, await enviaFoto(ana));
      await profile.updateMe(ana, { nickname: 'Aninha', avatarVisibility: 'TEAM_ONLY' }, 'UTC');
      await posts.create(ana, g.id, { body: 'Fechei a semana!' });

      const autorPara = async (userId: string) => (await posts.list(userId, g.id)).posts[0]!.author;
      expect(await autorPara(colega)).toMatchObject({ displayName: 'Aninha', avatarUrl: null });
      expect((await autorPara(dona)).avatarUrl).toEqual(expect.any(String));
      expect((await autorPara(ana)).avatarUrl).toEqual(expect.any(String));

      await profile.updateMe(ana, { avatarVisibility: 'COMMUNITIES' }, 'UTC');
      expect((await autorPara(colega)).avatarUrl).toEqual(expect.any(String));
    });
  });

  describe('apelido, bio, WhatsApp e unidades', () => {
    it('grava e devolve; vazio apaga', async () => {
      const ana = await pessoa();
      const me = await profile.updateMe(
        ana,
        {
          nickname: '  Ana  ',
          bio: 'Treino de manhã',
          whatsapp: '(65) 99812-3456',
          whatsappOptIn: true,
          loadUnit: 'LB',
          distanceUnit: 'MI',
          keepMealPhotos: true,
        },
        'UTC',
      );
      expect(me).toMatchObject({
        nickname: 'Ana',
        bio: 'Treino de manhã',
        whatsapp: '5565998123456',
        whatsappOptIn: true,
        loadUnit: 'LB',
        distanceUnit: 'MI',
        keepMealPhotos: true,
      });
      const limpo = await profile.updateMe(ana, { nickname: '', bio: '', whatsapp: '' }, 'UTC');
      expect(limpo).toMatchObject({
        nickname: null,
        bio: null,
        whatsapp: null,
        whatsappOptIn: false,
      });
    });

    it('recusa bio acima de 140, WhatsApp sem DDD e opt-in sem número', async () => {
      const ana = await pessoa();
      await expect(profile.updateMe(ana, { bio: 'x'.repeat(141) }, 'UTC')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(profile.updateMe(ana, { whatsapp: '998123' }, 'UTC')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(profile.updateMe(ana, { whatsappOptIn: true }, 'UTC')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('a unidade não muda nada registrado: o banco segue em kg', async () => {
      const ana = await pessoa();
      await prisma.weightLog.create({
        data: { userId: ana, weightKg: 70.2, loggedAt: new Date() },
      });
      await profile.updateMe(ana, { loadUnit: 'LB' }, 'UTC');
      const log = await prisma.weightLog.findFirstOrThrow({ where: { userId: ana } });
      expect(log.weightKg).toBe(70.2);
    });
  });

  describe('exportação por link', () => {
    it('o link vale 24 h e baixa os dados da dona do link', async () => {
      const ana = await pessoa();
      const agora = new Date();
      const link = await exports.createLink(ana, agora);
      expect(link.expiresAt.getTime() - agora.getTime()).toBe(EXPORT_LINK_TTL_MS);
      const token = link.url.split('/').at(-1)!;

      const arquivo = await exports.download(token);
      expect(arquivo.body.user.id).toBe(ana);
      expect(arquivo.filename).toMatch(/^fatia-dados-\d{4}-\d{2}-\d{2}\.json$/);
      // Só o hash fica no banco.
      expect(await prisma.dataExport.count({ where: { tokenHash: token } })).toBe(0);
    });

    it('vencido responde 410; desconhecido, 404', async () => {
      const ana = await pessoa();
      const ontem = new Date(Date.now() - EXPORT_LINK_TTL_MS - 1000);
      const link = await exports.createLink(ana, ontem);
      const token = link.url.split('/').at(-1)!;
      await expect(exports.download(token)).rejects.toBeInstanceOf(GoneException);
      await expect(exports.download('nao-existe')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('baixado uma vez, o link dura só mais 15 min (um link vazado não vale o dia todo)', async () => {
      const ana = await pessoa();
      const t0 = new Date();
      const link = await exports.createLink(ana, t0);
      const token = link.url.split('/').at(-1)!;

      await exports.download(token, t0);
      // Dentro da janela: baixar de novo funciona (rede caiu, outro app).
      await exports.download(token, new Date(t0.getTime() + EXPORT_LINK_REDOWNLOAD_MS - 1000));
      // A segunda baixa não estica a janela.
      await expect(
        exports.download(token, new Date(t0.getTime() + EXPORT_LINK_REDOWNLOAD_MS + 1000)),
      ).rejects.toBeInstanceOf(GoneException);
    });
  });

  describe('apagar a conta', () => {
    it('no app exige APAGAR; a frase do MCP não serve ali, e vice-versa', async () => {
      const ana = await pessoa();
      await expect(
        account.deleteAccount(ana, DELETE_CONFIRMATION, APP_DELETE_CONFIRMATION),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(account.deleteAccount(ana, APP_DELETE_CONFIRMATION)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(await prisma.user.findUnique({ where: { id: ana } })).not.toBeNull();
    });

    it('não sobra nada: foto, novidades, tutoriais, ideias e links somem', async () => {
      const ana = await pessoa();
      const fileId = await enviaFoto(ana);
      await profile.setAvatar(ana, fileId);
      const chave = (await prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } })).key;
      await you.markNewsRead(ana);
      await you.markTutorialSeen(ana, 'registrar-por-foto');
      await you.sendIdea(ana, 'Modo escuro no relógio');
      await exports.createLink(ana);

      await account.deleteAccount(ana, APP_DELETE_CONFIRMATION, APP_DELETE_CONFIRMATION);

      expect(await prisma.user.findUnique({ where: { id: ana } })).toBeNull();
      expect(await prisma.mediaFile.findUnique({ where: { id: fileId } })).toBeNull();
      expect(store.objects.get(chave)).toBeUndefined();
      expect(await prisma.userNewsRead.count({ where: { userId: ana } })).toBe(0);
      expect(await prisma.userTutorialSeen.count({ where: { userId: ana } })).toBe(0);
      expect(await prisma.feedbackIdea.count({ where: { userId: ana } })).toBe(0);
      expect(await prisma.dataExport.count({ where: { userId: ana } })).toBe(0);
    });

    it('apaga quem tem exercício próprio no plano e no treino feito (#412)', async () => {
      // O exercício próprio cai com a conta, e o plano e a série que apontam
      // para ele também: a ordem da cascata não pode travar a exclusão.
      const ana = await pessoa();
      const ex = await prisma.exercise.create({
        data: { name: `${stamp}-remada`, muscleGroup: 'costas', createdByUserId: ana },
      });
      const plano = await prisma.workoutPlan.create({
        data: {
          userId: ana,
          name: 'A',
          exercises: { create: { exerciseId: ex.id, order: 0, targetSets: 3, targetReps: '10' } },
        },
      });
      await prisma.workoutSession.create({
        data: {
          userId: ana,
          planId: plano.id,
          startedAt: new Date(),
          completedAt: new Date(),
          sets: { create: { exerciseId: ex.id, setNumber: 1, weightKg: 20, reps: 10 } },
        },
      });

      await account.deleteAccount(ana, APP_DELETE_CONFIRMATION, APP_DELETE_CONFIRMATION);

      expect(await prisma.user.findUnique({ where: { id: ana } })).toBeNull();
      expect(await prisma.exercise.findUnique({ where: { id: ex.id } })).toBeNull();
    });
  });

  describe('novidades, tutoriais e ideias', () => {
    it('conta as não lidas, marca uma, depois todas; id desconhecido é ignorado', async () => {
      const ana = await pessoa();
      // A conta "existe desde antes" de todas as novidades do catálogo.
      await prisma.user.update({ where: { id: ana }, data: { createdAt: new Date('2026-01-01') } });
      const antes = await you.news(ana);
      expect(antes.unreadCount).toBe(NEWS.length);

      const uma = await you.markNewsRead(ana, [NEWS[0]!.id, 'inventada']);
      expect(uma.unreadCount).toBe(NEWS.length - 1);
      expect(uma.items.find((i) => i.id === NEWS[0]!.id)!.unread).toBe(false);

      expect((await you.markNewsRead(ana)).unreadCount).toBe(0);
      expect(await prisma.userNewsRead.count({ where: { userId: ana, newsId: 'inventada' } })).toBe(
        0,
      );
    });

    it('quem chegou depois não herda novidades velhas como não lidas', async () => {
      const ana = await pessoa();
      await prisma.user.update({ where: { id: ana }, data: { createdAt: new Date('2099-01-01') } });
      expect((await you.news(ana)).unreadCount).toBe(0);
    });

    it('tutorial assistido e ideia ficam com a pessoa', async () => {
      const ana = await pessoa();
      expect(await you.markTutorialSeen(ana, 'registrar-por-foto')).toEqual({
        seen: ['registrar-por-foto'],
      });
      await expect(you.markTutorialSeen(ana, '../x')).rejects.toBeInstanceOf(BadRequestException);
      await expect(you.sendIdea(ana, '   ')).rejects.toBeInstanceOf(BadRequestException);
      await you.sendIdea(ana, 'Gráfico de sono');
      expect(await prisma.feedbackIdea.findMany({ where: { userId: ana } })).toEqual([
        expect.objectContaining({ body: 'Gráfico de sono' }),
      ]);
    });

    it('tutoriais vistos têm teto: um cliente não fabrica linhas sem fim', async () => {
      const ana = await pessoa();
      await prisma.userTutorialSeen.createMany({
        data: Array.from({ length: TUTORIALS_SEEN_MAX }, (_, i) => ({
          userId: ana,
          tutorialId: `t-${i}`,
        })),
      });
      await expect(you.markTutorialSeen(ana, 'mais-um')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      // Rever um que já está lá continua valendo.
      await expect(you.markTutorialSeen(ana, 't-0')).resolves.toBeDefined();
    });
  });
});
