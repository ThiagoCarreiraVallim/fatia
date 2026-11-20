import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { logtoManagementConfigured } from '../auth/logto-management.service';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { MediaService } from '../storage/media.service';
import { USER_SELECT } from './user-select';
import { profileUpdateData, type ProfileUpdate } from './profile-update';

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

/**
 * O perfil como o app e o MCP o recebem: a foto vira URL assinada de curta duração.
 * `mediaUploadEnabled` diz se o servidor tem bucket (`MEDIA_S3_*`): sem ele o app
 * esconde "Tirar foto / Galeria" em vez de deixar o envio falhar com 503.
 */
export type MeView = Omit<UserRow, 'avatarFile'> & {
  avatarUrl: string | null;
  mediaUploadEnabled: boolean;
  /** A troca de e-mail precisa da Management API do Logto (ADR 050). */
  emailChangeEnabled: boolean;
};

/**
 * O perfil da própria pessoa (Você, #387): leitura, edição e a foto. Mora fora
 * do controller porque o `get_me`/`update_me` do MCP devolvem exatamente a
 * mesma coisa, e a foto precisa do `MediaService` para virar URL.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async getMe(userId: string): Promise<MeView> {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
    if (!row) throw new NotFoundException('User not found');
    return this.view(row);
  }

  async updateMe(userId: string, input: ProfileUpdate, timezone: string): Promise<MeView> {
    const data = profileUpdateData(input, timezone);
    if (input.whatsappOptIn === true && input.whatsapp === undefined) {
      const atual = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { whatsapp: true },
      });
      if (!atual?.whatsapp) {
        throw new BadRequestException('Informe o WhatsApp antes de deixar a equipe chamar.');
      }
    }
    const row = await this.prisma.user.update({ where: { id: userId }, data, select: USER_SELECT });
    return this.view(row);
  }

  /**
   * Troca a foto pelo arquivo que a pessoa acabou de enviar (`user_avatar`). O
   * arquivo é conferido aqui — EXIF e localização saem no `confirm` — e a foto
   * anterior sai do bucket.
   */
  async setAvatar(userId: string, fileId: string): Promise<MeView> {
    const file = await this.media.resolvePersonal(userId, fileId, 'user_avatar');
    const antes = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarFileId: true },
    });
    const row = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarFileId: file.id },
      select: USER_SELECT,
    });
    if (antes.avatarFileId && antes.avatarFileId !== file.id) {
      await this.media.discardById(antes.avatarFileId);
    }
    return this.view(row);
  }

  async removeAvatar(userId: string): Promise<MeView> {
    const antes = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarFileId: true },
    });
    const row = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarFileId: null },
      select: USER_SELECT,
    });
    await this.media.discardById(antes.avatarFileId);
    return this.view(row);
  }

  private async view({ avatarFile, ...row }: UserRow): Promise<MeView> {
    const foto = await this.media.viewOrNull(avatarFile);
    return {
      ...row,
      avatarUrl: foto?.url ?? null,
      mediaUploadEnabled: this.media.enabled,
      emailChangeEnabled: this.config ? logtoManagementConfigured(this.config) : false,
    };
  }
}
