import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Put } from '@nestjs/common';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateMeDto } from './dto/update-me.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { SetAvatarDto } from './dto/set-avatar.dto';
import { AccountService, APP_DELETE_CONFIRMATION } from './account.service';
import { DataExportService } from './data-export.service';
import { ProfileService } from './profile.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly account: AccountService,
    private readonly profile: ProfileService,
    private readonly exports: DataExportService,
  ) {}

  @Get('me')
  getMe(@CurrentUser() user: CurrentUserPayload) {
    return this.profile.getMe(user.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateMeDto) {
    return this.profile.updateMe(user.id, dto, user.timezone);
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
