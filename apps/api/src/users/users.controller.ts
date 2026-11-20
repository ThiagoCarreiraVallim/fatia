import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateMeDto } from './dto/update-me.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { SetAvatarDto } from './dto/set-avatar.dto';
import { AccountService, APP_DELETE_CONFIRMATION } from './account.service';
import { DataExportService } from './data-export.service';
import { ProfileService } from './profile.service';
import { McpConnectionService } from '../auth/mcp-connection.service';
import { IdentitySyncService } from '../auth/identity-sync.service';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { ConfirmEmailChangeDto, RequestEmailChangeDto, SyncIdentityDto } from './dto/identity.dto';

@Controller('users')
export class UsersController {
  constructor(
    private readonly account: AccountService,
    private readonly profile: ProfileService,
    private readonly exports: DataExportService,
    private readonly mcp: McpConnectionService,
    private readonly identity: IdentitySyncService,
  ) {}

  @Get('me')
  async getMe(@CurrentUser() user: CurrentUserPayload) {
    const me = await this.profile.getMe(user.id);
    return { ...me, emailChangeEnabled: this.identity.emailChangeEnabled() };
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateMeDto) {
    const me = await this.profile.updateMe(user.id, dto, user.timezone);
    // O nome também no Logto, sem segurar a resposta (best-effort, ADR 050).
    if (dto.name !== undefined) void this.identity.pushName(user.id, me.name);
    return { ...me, emailChangeEnabled: this.identity.emailChangeEnabled() };
  }

  /**
   * E-mail e nome reais a partir do ID token do login (ADR 050). Só vale um ID
   * token emitido para o app mobile e com o `sub` desta conta.
   */
  @Post('me/identity')
  @HttpCode(200)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  syncIdentity(@CurrentUser() user: CurrentUserPayload, @Body() dto: SyncIdentityDto) {
    return this.identity.syncFromIdToken(user.id, dto.idToken);
  }

  /**
   * Troca de e-mail, parte 1: confere a senha, grava o pedido desta conta e
   * manda o código ao e-mail novo. Devolve o `requestToken` da parte 2.
   */
  @Post('me/email/code')
  @HttpCode(200)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  requestEmailChange(@CurrentUser() user: CurrentUserPayload, @Body() dto: RequestEmailChangeDto) {
    return this.identity.requestEmailChange(user.id, dto.email, dto.password);
  }

  /** Parte 2: o código recebido; grava no Logto e no perfil. */
  @Post('me/email')
  @HttpCode(200)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  confirmEmailChange(@CurrentUser() user: CurrentUserPayload, @Body() dto: ConfirmEmailChangeDto) {
    return this.identity.confirmEmailChange(user.id, dto.email, dto.code, dto.requestToken);
  }

  /**
   * A foto de perfil: o arquivo enviado por `POST /media/uploads` com o
   * propósito `user_avatar`. Só o da própria pessoa serve (o `fileId` é
   * amarrado a quem enviou no `MediaService`).
   */
  @Put('me/avatar')
  setAvatar(@CurrentUser() user: CurrentUserPayload, @Body() dto: SetAvatarDto) {
    return this.profile.setAvatar(user.id, dto.fileId);
  }

  @Delete('me/avatar')
  removeAvatar(@CurrentUser() user: CurrentUserPayload) {
    return this.profile.removeAvatar(user.id);
  }

  /**
   * "Conectar sua IA" (#388): o endereço para colar no app de IA e os apps que
   * esta pessoa já conectou, com o último acesso. Só as conexões dela.
   */
  @Get('me/mcp-connections')
  mcpConnections(@CurrentUser() user: CurrentUserPayload) {
    return this.mcp.overview(user.id);
  }

  /**
   * Portabilidade (LGPD art. 18, V). Devolve um link que vale 24 h; o arquivo
   * sai em `GET /exports/:token` (`ExportsController`).
   */
  @Post('me/exports')
  exportMyData(@CurrentUser() user: CurrentUserPayload) {
    return this.exports.createLink(user.id);
  }

  /**
   * Eliminação (LGPD art. 18, VI). Irreversível — exige que a pessoa digite
   * "APAGAR" (prancha Al-V8), conferido em `AccountService`.
   */
  @Delete('me')
  @HttpCode(200)
  deleteMe(@CurrentUser() user: CurrentUserPayload, @Body() dto: DeleteAccountDto) {
    return this.account.deleteAccount(user.id, dto.confirmation, APP_DELETE_CONFIRMATION);
  }
}
