import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../../common/prisma.service';
import { ConversationService } from '../../chat/conversation.service';
import { MediaService, ORPHAN_AFTER_MS } from '../media.service';
import { MemoryObjectStore } from '../memory-object-store';

/**
 * A foto do chat guardada no bucket (ADR 046), no Postgres real com o bucket em
 * memória: de quem ela é, a que mensagem se prende, e o que leva junto quando a
 * conversa ou a conta somem.
 */
describe('foto do chat (integração)', () => {
  const prisma = new PrismaService();
  const store = new MemoryObjectStore();
  const media = new MediaService(prisma, store);
  const conversas = new ConversationService(prisma);

  const stamp = `foto-chat-${Date.now()}`;
  const criados: string[] = [];
  let n = 0;

  async function pessoa() {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: `P${n}` },
    });
    criados.push(user.id);
    return user.id;
  }

  /** JPEG 3000×1500 com câmera e GPS no EXIF. */
  async function jpegComGps(): Promise<Buffer> {
    return sharp({
      create: { width: 3000, height: 1500, channels: 3, background: { r: 30, g: 160, b: 90 } },
    })
      .jpeg()
      .withExif({
        IFD0: { Make: 'CameraDeTeste', Model: 'X1' },
        IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 33/1 0/1' },
      })
      .toBuffer();
  }

  /** O caminho inteiro do cliente: pede a URL, sobe e confirma. */
  async function fotoPronta(userId: string): Promise<string> {
    const body = await jpegComGps();
    const r = await media.requestChatPhotoUpload(userId, {
      mime: 'image/jpeg',
      bytes: body.length,
    });
    const file = await prisma.mediaFile.findUniqueOrThrow({ where: { id: r.fileId } });
    store.upload(file.key, body, 'image/jpeg');
    await media.confirm(userId, r.fileId);
    return r.fileId;
  }

  afterAll(async () => {
    await prisma.conversation.deleteMany({ where: { userId: { in: criados } } });
    await prisma.mediaFile.deleteMany({ where: { uploaderId: { in: criados } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  it('a foto confirmada sai em JPEG de até 1280 px, sem EXIF, sob o prefixo da pessoa', async () => {
    const dono = await pessoa();
    const id = await fotoPronta(dono);

    const salva = await prisma.mediaFile.findUniqueOrThrow({ where: { id } });
    expect(salva).toMatchObject({
      status: 'READY',
      mime: 'image/jpeg',
      groupId: null,
      purpose: 'chat_photo',
      width: 1280,
      height: 640,
    });
    expect(salva.key).toBe(`users/${dono}/chat/${id}.jpg`);
    const final = await store.get(salva.key);
    expect((await sharp(final).metadata()).exif).toBeUndefined();
    expect(final.includes(Buffer.from('CameraDeTeste'))).toBe(false);
  });

  it('o turno lê a foto da pessoa, e a de outra pessoa responde como inexistente', async () => {
    const dona = await pessoa();
    const outra = await pessoa();
    const id = await fotoPronta(dona);

    const fotos = await media.chatPhotosForTurn(dona, [id]);
    expect(fotos).toHaveLength(1);
    expect(fotos[0].mediaType).toBe('image/jpeg');
    expect(Buffer.from(fotos[0].data, 'base64').subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));

    await expect(media.chatPhotosForTurn(outra, [id])).rejects.toBeInstanceOf(NotFoundException);
    await expect(media.chatPhotosForTurn(dona, [id, id])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('a foto se prende à mensagem, volta no histórico e não serve para outra mensagem', async () => {
    const dono = await pessoa();
    const id = await fotoPronta(dono);
    const conversa = randomUUID();

    await conversas.iniciarTurno(dono, conversa, 'o que tem aqui?', 0, null, [id]);

    const { messages } = await conversas.obterComMensagens(dono, conversa);
    const views = await media.chatPhotoViews(messages.map((m) => m.id));
    expect(views.get(messages[0].id)).toEqual([
      expect.objectContaining({ id, url: expect.stringMatching(/^memory:\/\/get\/users\//) }),
    ]);
    // Já usada: reenviar o id noutra mensagem é como se não existisse.
    await expect(media.chatPhotosForTurn(dono, [id])).rejects.toBeInstanceOf(NotFoundException);
  });

  it('o id de outra pessoa não se prende à mensagem, mesmo chegando ao iniciarTurno', async () => {
    const dona = await pessoa();
    const intrusa = await pessoa();
    const id = await fotoPronta(dona);
    const conversa = randomUUID();

    await conversas.iniciarTurno(intrusa, conversa, 'e esta?', 0, null, [id]);

    const salva = await prisma.mediaFile.findUniqueOrThrow({ where: { id } });
    expect(salva.chatMessageId).toBeNull();
  });

  it('apagar a conversa apaga a foto do bucket e a linha, e não toca a de outra conversa', async () => {
    const dono = await pessoa();
    const apagada = randomUUID();
    const mantida = randomUUID();
    const vai = await fotoPronta(dono);
    const fica = await fotoPronta(dono);
    await conversas.iniciarTurno(dono, apagada, 'uma', 0, null, [vai]);
    await conversas.iniciarTurno(dono, mantida, 'outra', 0, null, [fica]);
    const chaveQueVai = (await prisma.mediaFile.findUniqueOrThrow({ where: { id: vai } })).key;

    // A mesma ordem do `ChatController.deleteConversation`.
    await media.discardChatPhotosOf(dono, apagada);
    await conversas.apagar(dono, apagada);

    expect(store.objects.has(chaveQueVai)).toBe(false);
    expect(await prisma.mediaFile.findUnique({ where: { id: vai } })).toBeNull();
    expect(await prisma.mediaFile.findUnique({ where: { id: fica } })).not.toBeNull();
  });

  it('a varredura com o id de conversa alheia não acha foto nenhuma', async () => {
    const dona = await pessoa();
    const intrusa = await pessoa();
    const conversa = randomUUID();
    const id = await fotoPronta(dona);
    await conversas.iniciarTurno(dona, conversa, 'minha', 0, null, [id]);

    await media.discardChatPhotosOf(intrusa, conversa);

    expect(await prisma.mediaFile.findUnique({ where: { id } })).not.toBeNull();
  });

  it('a faxina leva a foto que nunca foi mandada e deixa a que está numa mensagem', async () => {
    const dono = await pessoa();
    const solta = await fotoPronta(dono);
    const usada = await fotoPronta(dono);
    await conversas.iniciarTurno(dono, randomUUID(), 'com foto', 0, null, [usada]);
    const antigo = new Date(Date.now() - ORPHAN_AFTER_MS - 60_000);
    await prisma.mediaFile.updateMany({
      where: { id: { in: [solta, usada] } },
      data: { createdAt: antigo },
    });

    await media.purgeOrphans(new Date());

    expect(await prisma.mediaFile.findUnique({ where: { id: solta } })).toBeNull();
    expect(await prisma.mediaFile.findUnique({ where: { id: usada } })).not.toBeNull();
  });

  it('apagar a conta leva as fotos do chat', async () => {
    const dono = await pessoa();
    const id = await fotoPronta(dono);
    await conversas.iniciarTurno(dono, randomUUID(), 'com foto', 0, null, [id]);
    const chave = (await prisma.mediaFile.findUniqueOrThrow({ where: { id } })).key;

    await media.beforeDeleteAccount(dono);

    expect(store.objects.has(chave)).toBe(false);
    expect(await prisma.mediaFile.findUnique({ where: { id } })).toBeNull();
  });
});
