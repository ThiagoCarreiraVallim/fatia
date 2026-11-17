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
import {
  MediaKind,
  MediaStatus,
  MembershipStatus,
  PostPolicy,
  type GroupRole,
  type MediaFile,
} from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { can, TEAM_ROLES, type GroupAction } from '../sharing/permissions';
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
  /** Imagem de post no mural (Fase 8b). A política do mural vale aqui também. */
  post_image: { kinds: [MediaKind.IMAGE], action: 'post.create' },
} as const satisfies Record<string, { kinds: readonly MediaKind[]; action: GroupAction }>;

/**
 * Arquivo pessoal, sem comunidade: quem envia é o dono e só a rota que o usa
 * (o perfil) decide quem lê. A foto de perfil é o primeiro (#387).
 */
export const PERSONAL_MEDIA_PURPOSES = {
  user_avatar: { kinds: [MediaKind.IMAGE] },
} as const satisfies Record<string, { kinds: readonly MediaKind[] }>;

/**
 * Foto do prato (ADR 038, #374). Não passa pela URL de envio: entra só pelo
 * reconhecimento da refeição, quando a pessoa escolheu guardar as fotos, e
 * vale enquanto a refeição existir.
 */
export const MEAL_PHOTO_PURPOSE = 'meal_photo';
/**
 * Foto guardada que não virou refeição some depois disto: a pessoa desistiu na
 * tela de confirmação, e a ADR 038 diz que essa foto é descartada.
 */
export const UNLINKED_MEAL_PHOTO_MS = 60 * 60 * 1000;

export type GroupMediaPurpose = keyof typeof MEDIA_PURPOSES;
export type PersonalMediaPurpose = keyof typeof PERSONAL_MEDIA_PURPOSES;
export type MediaPurpose = GroupMediaPurpose | PersonalMediaPurpose;

const isPersonal = (purpose: string): purpose is PersonalMediaPurpose =>
  purpose in PERSONAL_MEDIA_PURPOSES;

/**
 * A foto que a pessoa manda no chat (ADR 046). Fica fora de `MEDIA_PURPOSES` de
 * propósito: aquela tabela é de arquivo **da comunidade**, exige grupo e ação, e
 * é a lista que o `RequestUploadDto` aceita. A foto do chat é pessoal, e só nasce
 * pela rota própria.
 */
export const CHAT_PHOTO_PURPOSE = 'chat_photo';
/** As mesmas três do turno do chat (`MAX_FOTOS_POR_MENSAGEM`). */
export const MAX_CHAT_PHOTOS_PER_MESSAGE = 3;
/**
 * O lado maior da foto do chat. É o mesmo `LADO_MAXIMO` do PWA: o modelo de
 * visão não enxerga mais que isso num prato, e cada foto ainda vai ao agente em
 * base64 a cada turno em que é enviada.
 */
const CHAT_PHOTO_MAX_SIDE = 1280;

/** Uma foto do chat pronta para o agente: JPEG já reprocessado, em base64. */
export interface ChatPhotoForAgent {
  mediaType: 'image/jpeg';
  data: string;
}

export const MEDIA_LIMITS: Record<MediaKind, { mimes: readonly string[]; maxBytes: number }> = {
  IMAGE: { mimes: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 10 * 1024 * 1024 },
  VIDEO: { mimes: ['video/mp4', 'video/quicktime'], maxBytes: 200 * 1024 * 1024 },
};

/** Validade da URL de envio e da de leitura (ADR 028). */
export const UPLOAD_URL_TTL_SEC = 10 * 60;
export const READ_URL_TTL_SEC = 10 * 60;
/**
 * Os links das fotos no arquivo de exportação (LGPD): valem um dia, para a
 * pessoa baixar as fotos depois de baixar o arquivo.
 */
export const EXPORT_URL_TTL_SEC = 24 * 60 * 60;
/** Lado maior da imagem guardada, e o teto de pixels aceito na entrada. */
const IMAGE_MAX_SIDE = 1600;
const IMAGE_MAX_INPUT_PIXELS = 40_000_000;
/** Enviado e não usado vira lixo depois disto. */
export const ORPHAN_AFTER_MS = 24 * 60 * 60 * 1000;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

export interface RequestUploadInput {
  purpose: MediaPurpose;
  /** Obrigatório nos propósitos da comunidade; ignorado nos pessoais. */
  groupId?: string | null;
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

/**
 * Sai sem metadado nenhum (EXIF e GPS inclusive), girada pela orientação, no
 * máximo 1600 px, em WebP.
 */
function reencode(
  input: Buffer,
  // A foto do chat (ADR 038) sai em JPEG de 1280 px: o formato que o turno do chat aceita.
  opts: { side: number; format: 'webp' | 'jpeg' } = { side: IMAGE_MAX_SIDE, format: 'webp' },
): Promise<{ data: Buffer; info: sharp.OutputInfo }> {
  const imagem = sharp(input, { limitInputPixels: IMAGE_MAX_INPUT_PIXELS })
    // `rotate()` sem argumento aplica a orientação do EXIF antes de ele sumir;
    // o `sharp` não copia metadado nenhum para a saída sem `withMetadata`.
    .rotate()
    .resize({ width: opts.side, height: opts.side, fit: 'inside', withoutEnlargement: true });
  return (
    opts.format === 'jpeg' ? imagem.jpeg({ quality: 85 }) : imagem.webp({ quality: 82 })
  ).toBuffer({ resolveWithObject: true });
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
    const personal = isPersonal(input.purpose);
    const regra = personal
      ? PERSONAL_MEDIA_PURPOSES[input.purpose as PersonalMediaPurpose]
      : MEDIA_PURPOSES[input.purpose as GroupMediaPurpose];
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
    // Arquivo pessoal não passa por comunidade nenhuma: o `groupId` que vier no
    // corpo é ignorado, para não virar um arquivo "da comunidade" de outra pessoa.
    const groupId = personal ? null : (input.groupId ?? null);
    if (!personal) {
      if (!groupId) throw new BadRequestException('Informe a comunidade do arquivo.');
      const action = MEDIA_PURPOSES[input.purpose as GroupMediaPurpose].action;
      const role = await this.assertGroupAction(userId, groupId, action);
      if (input.purpose === 'post_image' && !TEAM_ROLES.includes(role)) {
        // Mural só da equipe: o bucket não guarda o que não vai virar post.
        const g = await this.prisma.group.findUniqueOrThrow({
          where: { id: groupId },
          select: { postPolicy: true },
        });
        if (g.postPolicy === PostPolicy.TEAM_ONLY) {
          throw new ForbiddenException('Nesta comunidade, só a equipe publica no mural');
        }
      }
    }

    const id = randomUUID();
    const key = groupId ? `groups/${groupId}/${id}/original` : `users/${userId}/${id}/original`;
    await this.prisma.mediaFile.create({
      data: {
        id,
        uploaderId: userId,
        groupId,
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
   * A URL de envio da foto do chat (ADR 046). Pessoal: não há grupo nem ação, e
   * a chave nasce sob o prefixo de quem pede. O resto do caminho — conferir,
   * reprocessar, tirar metadado — é o `confirm` de sempre.
   */
  async requestChatPhotoUpload(userId: string, input: { mime: string; bytes: number }) {
    const store = this.requireStore();
    if (kindOf(input.mime) !== MediaKind.IMAGE) {
      throw new BadRequestException('Envie uma imagem JPEG, PNG ou WebP.');
    }
    const limite = MEDIA_LIMITS.IMAGE;
    if (!Number.isInteger(input.bytes) || input.bytes <= 0 || input.bytes > limite.maxBytes) {
      throw new BadRequestException(
        `O arquivo passa do limite de ${Math.round(limite.maxBytes / 1024 / 1024)} MB.`,
      );
    }
    const id = randomUUID();
    const key = `users/${userId}/chat/${id}/original`;
    await this.prisma.mediaFile.create({
      data: {
        id,
        uploaderId: userId,
        groupId: null,
        purpose: CHAT_PHOTO_PURPOSE,
        kind: MediaKind.IMAGE,
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
   * A foto do chat sai em JPEG de 1280 px: é o formato que o turno do chat
   * aceita e que todo modelo de visão lê.
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

    const doChat = file.purpose === CHAT_PHOTO_PURPOSE;
    const lado = doChat ? CHAT_PHOTO_MAX_SIDE : IMAGE_MAX_SIDE;
    let saida: { data: Buffer; info: sharp.OutputInfo };
    try {
      saida = await reencode(
        await store.get(file.key),
        doChat ? { side: lado, format: 'jpeg' } : undefined,
      );
    } catch {
      await this.discard([file]);
      throw new BadRequestException('Não deu para ler esta imagem. Tente outra.');
    }

    const mime = doChat ? 'image/jpeg' : 'image/webp';
    // A chave final troca o `/original` pela extensão, sob o mesmo prefixo: o da
    // comunidade (`groups/…`) ou o da pessoa (`users/…/chat`).
    const finalKey = file.key.replace(/\/original$/, doChat ? '.jpg' : '.webp');
    await store.put(finalKey, saida.data, mime);
    await store.delete([file.key]);
    const pronta = await this.prisma.mediaFile.update({
      where: { id: file.id },
      data: {
        key: finalKey,
        mime,
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
   * Guarda uma imagem pessoal que chegou pelo corpo de uma rota (a foto do
   * prato, #374), sem URL de envio: recodificada como no `confirm` e pronta
   * na hora. Sem bucket configurado devolve `null` e nada é guardado.
   */
  async storePersonalImage(
    userId: string,
    purpose: typeof MEAL_PHOTO_PURPOSE,
    body: Buffer,
  ): Promise<MediaFile | null> {
    if (!this.store) return null;
    const saida = await reencode(body);
    const id = randomUUID();
    const key = `users/${userId}/${id}.webp`;
    await this.store.put(key, saida.data, 'image/webp');
    return this.prisma.mediaFile.create({
      data: {
        id,
        uploaderId: userId,
        groupId: null,
        purpose,
        kind: MediaKind.IMAGE,
        key,
        mime: 'image/webp',
        bytes: saida.data.length,
        width: saida.info.width,
        height: saida.info.height,
        status: MediaStatus.READY,
        confirmedAt: new Date(),
      },
    });
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

  /**
   * O arquivo pessoal que o perfil vai usar: confirmado agora se ainda estava
   * pendente, enviado pela própria pessoa e para este propósito. O de outra
   * pessoa responde como inexistente (#92).
   */
  async resolvePersonal(
    userId: string,
    fileId: string,
    purpose: PersonalMediaPurpose,
  ): Promise<MediaFile> {
    const file = await this.prisma.mediaFile.findFirst({
      where: { id: fileId, uploaderId: userId, groupId: null, purpose },
    });
    if (!file) throw new NotFoundException('File not found');
    if (file.status !== MediaStatus.READY) await this.confirm(userId, fileId);
    return this.prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } });
  }

  /**
   * As fotos de um turno do chat, prontas para o agente. Cada id precisa ser
   * desta pessoa, de foto do chat, pronta e ainda solta — uma foto já usada
   * noutra mensagem não é reenviada por id (ela é da outra mensagem). Qualquer
   * id que falhe responde como inexistente, sem dizer qual (#92).
   *
   * Lê os bytes do bucket: a foto vai ao agente em base64, como antes (ADR
   * 020), e o agente não ganha um destino de rede novo.
   */
  async chatPhotosForTurn(userId: string, ids: string[]): Promise<ChatPhotoForAgent[]> {
    if (ids.length === 0) return [];
    const unicos = [...new Set(ids)];
    if (unicos.length !== ids.length)
      throw new BadRequestException('A mesma foto veio duas vezes.');
    const store = this.requireStore();
    const files = await this.prisma.mediaFile.findMany({
      where: {
        id: { in: unicos },
        uploaderId: userId,
        purpose: CHAT_PHOTO_PURPOSE,
        status: MediaStatus.READY,
        chatMessageId: null,
      },
      select: { id: true, key: true },
    });
    if (files.length !== unicos.length) throw new NotFoundException('Foto não encontrada.');
    const porId = new Map(files.map((f) => [f.id, f.key]));
    return Promise.all(
      unicos.map(async (id) => ({
        mediaType: 'image/jpeg' as const,
        data: (await store.get(porId.get(id) as string)).toString('base64'),
      })),
    );
  }

  /**
   * As fotos guardadas de cada mensagem, com URL assinada, na ordem em que
   * foram mandadas. Quem chama já amarrou as mensagens à pessoa.
   */
  async chatPhotoViews(messageIds: string[]): Promise<Map<string, MediaView[]>> {
    const porMensagem = new Map<string, MediaView[]>();
    if (messageIds.length === 0) return porMensagem;
    const files = await this.prisma.mediaFile.findMany({
      where: { chatMessageId: { in: messageIds }, status: MediaStatus.READY },
      orderBy: { chatPosition: 'asc' },
    });
    for (const file of files) {
      const lista = porMensagem.get(file.chatMessageId as string) ?? [];
      lista.push(await this.view(file));
      porMensagem.set(file.chatMessageId as string, lista);
    }
    return porMensagem;
  }

  /**
   * Antes de apagar a conversa: as fotos dela, objeto e linha. Depois do
   * `delete` da conversa não daria mais para achá-las pela mensagem — o
   * `SetNull` as solta, e só a faxina de órfãos as alcançaria.
   */
  async discardChatPhotosOf(userId: string, conversationId: string): Promise<void> {
    const files = await this.prisma.mediaFile.findMany({
      where: { chatMessage: { conversation: { id: conversationId, userId } } },
      select: { id: true, key: true },
    });
    await this.discard(files);
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

  /** Link do arquivo no export da própria pessoa (`EXPORT_URL_TTL_SEC`). */
  async exportUrl(file: Pick<MediaFile, 'key' | 'status'>): Promise<string | null> {
    if (!this.store || file.status !== MediaStatus.READY) return null;
    return this.store.presignGet(file.key, EXPORT_URL_TTL_SEC);
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
            postImageOf: { is: null },
            userAvatarOf: { is: null },
            mealPhotoOf: { is: null },
            chatMessageId: null,
          },
        ],
      },
      select: { id: true, key: true },
      take: 500,
    });
    // A foto do prato que não virou refeição não espera as 24 h (ADR 038).
    const fotosSoltas = await this.prisma.mediaFile.findMany({
      where: {
        purpose: MEAL_PHOTO_PURPOSE,
        createdAt: { lt: new Date(now.getTime() - UNLINKED_MEAL_PHOTO_MS) },
        mealPhotoOf: { is: null },
        id: { notIn: lixo.map((f) => f.id) },
      },
      select: { id: true, key: true },
      take: 500,
    });
    await this.discard([...lixo, ...fotosSoltas]);
    return lixo.length + fotosSoltas.length;
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
        OR: [
          { uploaderId: userId, groupId: null },
          { group: { ownerId: userId } },
          // As imagens dos posts dela: o post cai junto com a conta (ADR 032).
          { postImageOf: { post: { author: { userId } } } },
        ],
      },
      select: { id: true, key: true },
    });
    await this.discard(files);
  }

  private async assertGroupAction(
    userId: string,
    groupId: string,
    action: GroupAction,
  ): Promise<GroupRole> {
    const m = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { role: true, status: true },
    });
    // Não membro e grupo inexistente respondem igual (#92).
    if (!m || m.status !== MembershipStatus.ACTIVE) throw new NotFoundException('Group not found');
    if (!can(m.role, action)) throw new ForbiddenException('Seu papel não envia este arquivo');
    return m.role;
  }
}
