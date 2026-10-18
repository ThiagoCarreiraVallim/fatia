import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { MediaKind, MediaStatus, MembershipStatus, type MediaFile } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { can, type GroupAction } from '../sharing/permissions';
import { OBJECT_STORE, type ObjectStore } from './object-store.port';

/**
 * Para que cada arquivo é enviado, e o que isso exige. O item que referencia o
 * arquivo confere o propósito: a imagem enviada como avatar não vira capa de
 * plano de outra tela, e a ação exigida é a da tela que vai usar o arquivo.
 */
export const MEDIA_PURPOSES = {
  group_avatar: { kinds: [MediaKind.IMAGE], action: 'group.update' },
  group_content: { kinds: [MediaKind.IMAGE], action: 'content.publish' },
  /** Tutorial da comunidade para um exercício (Fase 7b): o vídeo e as fotos. */
  exercise_video: { kinds: [MediaKind.VIDEO], action: 'content.publish' },
  exercise_photo: { kinds: [MediaKind.IMAGE], action: 'content.publish' },
  /** O avatar do agente da comunidade no chat (Fase 7c). */
  agent_avatar: { kinds: [MediaKind.IMAGE], action: 'group.update' },
} as const satisfies Record<string, { kinds: readonly MediaKind[]; action: GroupAction }>;

export type MediaPurpose = keyof typeof MEDIA_PURPOSES;

export const MEDIA_LIMITS: Record<MediaKind, { mimes: readonly string[]; maxBytes: number }> = {
  IMAGE: { mimes: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 10 * 1024 * 1024 },
  VIDEO: { mimes: ['video/mp4', 'video/quicktime'], maxBytes: 200 * 1024 * 1024 },
};

/** Validade da URL de envio e da de leitura (ADR 028). */
export const UPLOAD_URL_TTL_SEC = 10 * 60;
export const READ_URL_TTL_SEC = 10 * 60;
/** Lado maior da imagem guardada, e o teto de pixels aceito na entrada. */
const IMAGE_MAX_SIDE = 1600;
const IMAGE_MAX_INPUT_PIXELS = 40_000_000;
/** Enviado e não usado vira lixo depois disto. */
export const ORPHAN_AFTER_MS = 24 * 60 * 60 * 1000;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

export interface RequestUploadInput {
  purpose: MediaPurpose;
  groupId: string;
  mime: string;
  bytes: number;
}

export interface MediaView {
  id: string;
  kind: MediaKind;
  url: string | null;
  width: number | null;
  height: number | null;
}

const kindOf = (mime: string): MediaKind | null =>
  (Object.keys(MEDIA_LIMITS) as MediaKind[]).find((k) => MEDIA_LIMITS[k].mimes.includes(mime)) ??
  null;

/**
 * Mídia publicada pela comunidade (ADR 028): registro, envio direto ao bucket
 * por URL assinada, conferência e reprocessamento, leitura assinada e faxina.
 *
 * O arquivo é **da comunidade**: quem envia precisa da ação da tela que vai
 * usá-lo, e quem lê só recebe a URL dentro da resposta de uma rota que já
 * conferiu que a pessoa pode ver aquele conteúdo. Este service não emite URL
 * de leitura por id solto.
 */
@Injectable()
export class MediaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaService.name);
  private purgeTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
  ) {}

  onModuleInit(): void {
    if (!this.store) return;
    const run = () =>
      void this.purgeOrphans(new Date()).catch((err: unknown) =>
        this.logger.warn(
          `Faxina de mídia falhou: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    // `unref`: o timer não segura o processo (nem o jest) só por existir.
    this.purgeTimer = setInterval(run, PURGE_INTERVAL_MS);
    this.purgeTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
    this.purgeTimer = null;
  }

  get enabled(): boolean {
    return this.store !== null;
  }

  private requireStore(): ObjectStore {
    if (!this.store) {
      throw new ServiceUnavailableException('O envio de imagens não está disponível agora.');
    }
    return this.store;
  }

  /**
   * Registra o arquivo como pendente e devolve a URL de envio direto. O tipo e
   * o tamanho declarados entram na assinatura.
   */
  async requestUpload(userId: string, input: RequestUploadInput) {
    const store = this.requireStore();
    const regra = MEDIA_PURPOSES[input.purpose];
    if (!regra) throw new BadRequestException('Propósito de envio desconhecido.');
    const kind = kindOf(input.mime);
    if (!kind || !(regra.kinds as readonly MediaKind[]).includes(kind)) {
      throw new BadRequestException(
        (regra.kinds as readonly MediaKind[]).includes(MediaKind.VIDEO)
          ? 'Envie um vídeo MP4 ou MOV.'
          : 'Envie uma imagem JPEG, PNG ou WebP.',
      );
    }
    const limite = MEDIA_LIMITS[kind];
    if (!Number.isInteger(input.bytes) || input.bytes <= 0 || input.bytes > limite.maxBytes) {
      throw new BadRequestException(
        `O arquivo passa do limite de ${Math.round(limite.maxBytes / 1024 / 1024)} MB.`,
      );
    }
    await this.assertGroupAction(userId, input.groupId, regra.action);

    const id = randomUUID();
    const key = `groups/${input.groupId}/${id}/original`;
    await this.prisma.mediaFile.create({
      data: {
        id,
        uploaderId: userId,
        groupId: input.groupId,
        purpose: input.purpose,
        kind,
        key,
        mime: input.mime,
        bytes: input.bytes,
      },
    });
    const uploadUrl = await store.presignPut(key, input.mime, input.bytes, UPLOAD_URL_TTL_SEC);
    return { fileId: id, uploadUrl, headers: { 'Content-Type': input.mime } };
  }

  /**
   * Confere o objeto enviado e, se for imagem, reprocessa: sai sem metadado
   * nenhum (EXIF e GPS inclusive), girada pela orientação, no máximo 1600 px,
   * em WebP. O original é apagado.
   *
   * Só quem enviou confirma, e arquivo de outra pessoa responde como
   * inexistente (#92).
   */
  async confirm(userId: string, fileId: string): Promise<MediaView> {
    const store = this.requireStore();
    const file = await this.prisma.mediaFile.findFirst({
      where: { id: fileId, uploaderId: userId },
    });
    if (!file) throw new NotFoundException('File not found');
    if (file.status === MediaStatus.READY) return this.view(file);

    const enviado = await store.head(file.key);
    if (!enviado || enviado.bytes !== file.bytes) {
      throw new BadRequestException('O arquivo não chegou inteiro. Envie de novo.');
    }

    if (file.kind === MediaKind.VIDEO) {
      // Vídeo é servido como chegou, sem conversão (ADR 028). O tipo declarado
      // não prova nada: os bytes iniciais têm de ser os de um MP4/MOV (a caixa
      // `ftyp` do ISO BMFF), senão um HTML qualquer ficaria no bucket da
      // comunidade com cara de vídeo.
      const inicio = await store.getStart(file.key, 12);
      if (inicio.subarray(4, 8).toString('latin1') !== 'ftyp') {
        await this.discard([file]);
        throw new BadRequestException('Não deu para ler este vídeo. Envie um MP4 ou MOV.');
      }
      const pronto = await this.prisma.mediaFile.update({
        where: { id: file.id },
        data: { status: MediaStatus.READY, confirmedAt: new Date() },
      });
      return this.view(pronto);
    }

    let saida: { data: Buffer; info: sharp.OutputInfo };
    try {
      saida = await sharp(await store.get(file.key), { limitInputPixels: IMAGE_MAX_INPUT_PIXELS })
        // `rotate()` sem argumento aplica a orientação do EXIF antes de ele sumir;
        // o `sharp` não copia metadado nenhum para a saída sem `withMetadata`.
        .rotate()
        .resize({
          width: IMAGE_MAX_SIDE,
          height: IMAGE_MAX_SIDE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      await this.discard([file]);
      throw new BadRequestException('Não deu para ler esta imagem. Tente outra.');
    }

    const finalKey = `groups/${file.groupId}/${file.id}.webp`;
    await store.put(finalKey, saida.data, 'image/webp');
    await store.delete([file.key]);
    const pronta = await this.prisma.mediaFile.update({
      where: { id: file.id },
      data: {
        key: finalKey,
        mime: 'image/webp',
        bytes: saida.data.length,
        width: saida.info.width,
        height: saida.info.height,
        status: MediaStatus.READY,
        confirmedAt: new Date(),
      },
    });
    return this.view(pronta);
  }

  /**
   * O arquivo que um item da comunidade vai referenciar: pronto, da mesma
   * comunidade da URL e enviado para este propósito. Qualquer outra coisa
   * responde como inexistente — um `fileId` de outra comunidade não vira capa
   * aqui.
   */
  async resolveForGroup(
    groupId: string,
    fileId: string,
    purpose: MediaPurpose,
  ): Promise<MediaFile> {
    const file = await this.prisma.mediaFile.findFirst({
      where: { id: fileId, groupId, purpose, status: MediaStatus.READY },
    });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  /** URL assinada para quem a rota já autorizou a ver o conteúdo. */
  async view(file: MediaFile): Promise<MediaView> {
    return {
      id: file.id,
      kind: file.kind,
      url:
        this.store && file.status === MediaStatus.READY
          ? await this.store.presignGet(file.key, READ_URL_TTL_SEC)
          : null,
      width: file.width,
      height: file.height,
    };
  }

  async viewOrNull(file: MediaFile | null | undefined): Promise<MediaView | null> {
    return file ? this.view(file) : null;
  }

  /** Apaga objetos e linhas. Usado ao trocar ou tirar a imagem de um item. */
  async discard(files: Pick<MediaFile, 'id' | 'key'>[]): Promise<void> {
    if (files.length === 0) return;
    if (this.store) await this.store.delete(files.map((f) => f.key));
    await this.prisma.mediaFile.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
  }

  async discardById(fileId: string | null | undefined): Promise<void> {
    if (!fileId) return;
    const file = await this.prisma.mediaFile.findUnique({ where: { id: fileId } });
    if (file) await this.discard([file]);
  }

  /**
   * Faxina: o que ficou pendente, ou foi confirmado e nenhum item usa, depois
   * de 24 h. Cobre quem abandonou o formulário no meio.
   */
  async purgeOrphans(now: Date): Promise<number> {
    const limite = new Date(now.getTime() - ORPHAN_AFTER_MS);
    const lixo = await this.prisma.mediaFile.findMany({
      where: {
        createdAt: { lt: limite },
        OR: [
          { status: MediaStatus.PENDING },
          {
            groupAvatarOf: { is: null },
            agentAvatarOf: { is: null },
            templateCovers: { none: {} },
            tipImages: { none: {} },
            guideVideoOf: { is: null },
            guidePhotoOf: { is: null },
          },
        ],
      },
      select: { id: true, key: true },
      take: 500,
    });
    await this.discard(lixo);
    return lixo.length;
  }

  /**
   * Antes de apagar a comunidade: os objetos dela. As linhas caem em cascata
   * com o grupo; os objetos, sem isto, ficariam no bucket para sempre.
   */
  async beforeDeleteGroup(groupId: string): Promise<void> {
    const files = await this.prisma.mediaFile.findMany({
      where: { groupId },
      select: { key: true },
    });
    if (files.length > 0 && this.store) await this.store.delete(files.map((f) => f.key));
  }

  /**
   * Antes de apagar a conta: os arquivos pessoais da pessoa e os das
   * comunidades de que ela é dona, que caem junto com a conta. O que ela
   * publicou na comunidade de outra pessoa é da comunidade e fica.
   */
  async beforeDeleteAccount(userId: string): Promise<void> {
    const files = await this.prisma.mediaFile.findMany({
      where: {
        OR: [{ uploaderId: userId, groupId: null }, { group: { ownerId: userId } }],
      },
      select: { id: true, key: true },
    });
    await this.discard(files);
  }

  private async assertGroupAction(userId: string, groupId: string, action: GroupAction) {
    const m = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { role: true, status: true },
    });
    // Não membro e grupo inexistente respondem igual (#92).
    if (!m || m.status !== MembershipStatus.ACTIVE) throw new NotFoundException('Group not found');
    if (!can(m.role, action)) throw new ForbiddenException('Seu papel não envia este arquivo');
  }
}
