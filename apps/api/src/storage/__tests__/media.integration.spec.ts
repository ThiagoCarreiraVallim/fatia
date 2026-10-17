import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../../common/prisma.service';
import { GroupService } from '../../sharing/group.service';
import { ProfessionalLinkService } from '../../sharing/professional-link.service';
import { MediaService, ORPHAN_AFTER_MS } from '../media.service';
import { MemoryObjectStore } from '../memory-object-store';

/**
 * Mídia da comunidade (ADR 028) no Postgres real, com o bucket em memória: quem
 * envia, o que é aceito, o EXIF que sai, e o que a faxina e as exclusões levam.
 */
describe('mídia da comunidade (integração)', () => {
  const prisma = new PrismaService();
  const store = new MemoryObjectStore();
  const media = new MediaService(prisma, store);
  const links = new ProfessionalLinkService(prisma);
  const groups = new GroupService(prisma, links, [], media);

  const stamp = `midia-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;

  async function pessoa() {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: `P${n}` },
    });
    criados.push(user.id);
    return user.id;
  }

  async function comunidade() {
    const dono = await pessoa();
    const grupo = await groups.create(dono, { type: 'SPONSORED', name: 'Academia' });
    grupos.push(grupo.id);
    return { dono, groupId: grupo.id };
  }

  async function membroCom(groupId: string, role: 'MEMBER' | 'PROFESSIONAL') {
    const id = await pessoa();
    await prisma.groupMembership.create({
      data: { groupId, userId: id, role, status: 'ACTIVE', joinedAt: new Date() },
    });
    return id;
  }

  /** JPEG 2000×1000 com GPS e câmera no EXIF. */
  async function jpegComGps(): Promise<Buffer> {
    return sharp({
      create: { width: 2000, height: 1000, channels: 3, background: { r: 200, g: 80, b: 40 } },
    })
      .jpeg()
      .withExif({
        IFD0: { Make: 'CameraDeTeste', Model: 'X1' },
        IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 33/1 0/1' },
      })
      .toBuffer();
  }

  async function enviar(userId: string, groupId: string, body: Buffer, mime = 'image/jpeg') {
    const r = await media.requestUpload(userId, {
      purpose: 'group_content',
      groupId,
      mime,
      bytes: body.length,
    });
    const file = await prisma.mediaFile.findUniqueOrThrow({ where: { id: r.fileId } });
    store.upload(file.key, body, mime);
    return { ...r, key: file.key };
  }

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.mediaFile.deleteMany({ where: { uploaderId: { in: criados } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  it('a imagem confirmada sai sem EXIF, em WebP e com no máximo 1600 px', async () => {
    const { dono, groupId } = await comunidade();
    const original = await jpegComGps();
    // A fixture tem mesmo o metadado que o teste diz que some.
    expect((await sharp(original).metadata()).exif).toBeDefined();

    const { fileId, uploadUrl, key } = await enviar(dono, groupId, original);
    expect(uploadUrl).toContain(`bytes=${original.length}`);
    const view = await media.confirm(dono, fileId);

    const salvo = await prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } });
    expect(salvo).toMatchObject({ status: 'READY', mime: 'image/webp', width: 1600, height: 800 });
    const final = await store.get(salvo.key);
    const meta = await sharp(final).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(final.includes(Buffer.from('CameraDeTeste'))).toBe(false);
    // O original foi apagado e a leitura sai assinada.
    expect(store.objects.has(key)).toBe(false);
    expect(view.url).toMatch(/^memory:\/\/get\/groups\//);
  });

  it('recusa tipo e tamanho fora do limite antes de emitir URL', async () => {
    const { dono, groupId } = await comunidade();
    await expect(
      media.requestUpload(dono, {
        purpose: 'group_content',
        groupId,
        mime: 'image/gif',
        bytes: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      media.requestUpload(dono, {
        purpose: 'group_content',
        groupId,
        mime: 'image/png',
        bytes: 10 * 1024 * 1024 + 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Vídeo ainda não tem propósito que o aceite (7b).
    await expect(
      media.requestUpload(dono, {
        purpose: 'group_content',
        groupId,
        mime: 'video/mp4',
        bytes: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('só a equipe que publica envia, e só para a própria comunidade', async () => {
    const { groupId } = await comunidade();
    const outra = await comunidade();
    const membro = await membroCom(groupId, 'MEMBER');
    const prof = await membroCom(groupId, 'PROFESSIONAL');

    await expect(
      media.requestUpload(membro, {
        purpose: 'group_content',
        groupId,
        mime: 'image/png',
        bytes: 10,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // Profissional publica conteúdo, mas não troca o avatar da comunidade.
    await expect(
      media.requestUpload(prof, { purpose: 'group_avatar', groupId, mime: 'image/png', bytes: 10 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      media.requestUpload(prof, {
        purpose: 'group_content',
        groupId: outra.groupId,
        mime: 'image/png',
        bytes: 10,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('confirmar arquivo de outra pessoa responde como inexistente', async () => {
    const { dono, groupId } = await comunidade();
    const prof = await membroCom(groupId, 'PROFESSIONAL');
    const { fileId } = await enviar(dono, groupId, await jpegComGps());
    await expect(media.confirm(prof, fileId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('arquivo de outra comunidade não é aceito como imagem desta', async () => {
    const a = await comunidade();
    const b = await comunidade();
    const { fileId } = await enviar(a.dono, a.groupId, await jpegComGps());
    await media.confirm(a.dono, fileId);
    await expect(media.resolveForGroup(b.groupId, fileId, 'group_content')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(media.resolveForGroup(a.groupId, fileId, 'group_avatar')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(media.resolveForGroup(a.groupId, fileId, 'group_content')).resolves.toMatchObject({
      id: fileId,
    });
  });

  it('corpo de tamanho diferente do declarado não confirma', async () => {
    const { dono, groupId } = await comunidade();
    const r = await media.requestUpload(dono, {
      purpose: 'group_content',
      groupId,
      mime: 'image/png',
      bytes: 999,
    });
    const file = await prisma.mediaFile.findUniqueOrThrow({ where: { id: r.fileId } });
    store.upload(file.key, Buffer.from('curto'), 'image/png');
    await expect(media.confirm(dono, r.fileId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a faxina leva pendente e não usado antigos, e deixa o avatar em uso', async () => {
    const { dono, groupId } = await comunidade();
    const pendente = await enviar(dono, groupId, await jpegComGps());
    const solto = await enviar(dono, groupId, await jpegComGps());
    await media.confirm(dono, solto.fileId);

    const avatar = await media.requestUpload(dono, {
      purpose: 'group_avatar',
      groupId,
      mime: 'image/jpeg',
      bytes: (await jpegComGps()).length,
    });
    const avatarFile = await prisma.mediaFile.findUniqueOrThrow({ where: { id: avatar.fileId } });
    store.upload(avatarFile.key, await jpegComGps(), 'image/jpeg');
    await media.confirm(dono, avatar.fileId);
    await groups.setAvatar(dono, groupId, avatar.fileId);

    const antigo = new Date(Date.now() - ORPHAN_AFTER_MS - 60_000);
    await prisma.mediaFile.updateMany({
      where: { id: { in: [pendente.fileId, solto.fileId, avatar.fileId] } },
      data: { createdAt: antigo },
    });

    await media.purgeOrphans(new Date());
    const restantes = await prisma.mediaFile.findMany({ where: { groupId }, select: { id: true } });
    expect(restantes.map((f) => f.id)).toEqual([avatar.fileId]);
  });

  it('trocar o avatar apaga o anterior, e apagar a comunidade apaga os objetos', async () => {
    const { dono, groupId } = await comunidade();
    const ids: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const body = await jpegComGps();
      const r = await media.requestUpload(dono, {
        purpose: 'group_avatar',
        groupId,
        mime: 'image/jpeg',
        bytes: body.length,
      });
      const f = await prisma.mediaFile.findUniqueOrThrow({ where: { id: r.fileId } });
      store.upload(f.key, body, 'image/jpeg');
      await media.confirm(dono, r.fileId);
      await groups.setAvatar(dono, groupId, r.fileId);
      ids.push(r.fileId);
    }
    expect(await prisma.mediaFile.findUnique({ where: { id: ids[0] } })).toBeNull();
    const resumo = await groups.findByIdForMember(dono, groupId);
    expect(resumo.avatarUrl).toMatch(/^memory:\/\/get\//);

    const chave = (await prisma.mediaFile.findUniqueOrThrow({ where: { id: ids[1] } })).key;
    await media.beforeDeleteGroup(groupId);
    expect(store.objects.has(chave)).toBe(false);
  });
});
