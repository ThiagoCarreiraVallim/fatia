import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { MediaIdParamDto, RequestUploadDto } from './dto/media.dto';
import { MediaService } from './media.service';

/**
 * Envio de mídia (ADR 028). O arquivo vai direto do aparelho ao bucket; aqui só
 * se pede a URL e se confirma. A permissão é conferida no service, pela ação da
 * tela que vai usar o arquivo — o `groupId` vem no corpo e não na rota, então o
 * `GroupRoleGuard` não o enxergaria.
 */
@Controller('media')
@UseGuards(UserThrottlerGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('uploads')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  requestUpload(@CurrentUser() user: CurrentUserPayload, @Body() dto: RequestUploadDto) {
    return this.media.requestUpload(user.id, dto);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  confirm(@CurrentUser() user: CurrentUserPayload, @Param() p: MediaIdParamDto) {
    return this.media.confirm(user.id, p.id);
  }
}
