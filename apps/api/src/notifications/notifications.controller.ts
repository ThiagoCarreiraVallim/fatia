import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  DeviceParamDto,
  MarkInboxReadDto,
  NotificationPreferencesDto,
  RegisterDeviceDto,
  WebPushSubscribeDto,
  WebPushUnsubscribeDto,
} from './dto/notification.dto';
import { NotificationService } from './notification.service';
import { InboxService } from './inbox.service';

/**
 * Os celulares, as preferências de aviso e a central do sino de quem está
 * logado (Fase 8c, ADR 033; #373).
 */
@Controller('users/me')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly inbox: InboxService,
  ) {}

  /** A central de avisos do sino no Hoje (#373): os mais recentes e quantos não foram lidos. */
  @Get('inbox')
  inboxList(@CurrentUser() user: CurrentUserPayload) {
    return this.inbox.list(user.id);
  }

  /** Só marca aviso de quem está logado: id de outra pessoa no corpo não conta. */
  @Post('inbox/read')
  inboxRead(@CurrentUser() user: CurrentUserPayload, @Body() dto: MarkInboxReadDto) {
    return this.inbox.markRead(user.id, dto.ids);
  }

  @Get('devices')
  devices(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.listDevices(user.id);
  }

  @Post('devices')
  register(@CurrentUser() user: CurrentUserPayload, @Body() dto: RegisterDeviceDto) {
    return this.notifications.registerDevice(user.id, dto);
  }

  @Delete('devices/:id')
  remove(@CurrentUser() user: CurrentUserPayload, @Param() p: DeviceParamDto) {
    return this.notifications.removeDevice(user.id, p.id);
  }

  @Get('notifications')
  preferences(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.preferences(user.id);
  }

  /** A tela de Notificações inteira (prancha Al-V4, #389): chaves, silêncio e equipe. */
  @Get('notification-settings')
  settings(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.settings(user.id);
  }

  @Put('notifications')
  setPreferences(@CurrentUser() user: CurrentUserPayload, @Body() dto: NotificationPreferencesDto) {
    return this.notifications.setPreferences(user.id, dto);
  }

  /** Push no navegador (Fase 9g): a chave pública e se esta conta já tem algum. */
  @Get('web-push')
  webPush(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.webPushStatus(user.id);
  }

  @Post('web-push')
  subscribeWebPush(@CurrentUser() user: CurrentUserPayload, @Body() dto: WebPushSubscribeDto) {
    return this.notifications.subscribeWebPush(user.id, dto);
  }

  /** POST e não DELETE: o endpoint vai no corpo, e DELETE com corpo é frágil em proxy. */
  @Post('web-push/unsubscribe')
  unsubscribeWebPush(@CurrentUser() user: CurrentUserPayload, @Body() dto: WebPushUnsubscribeDto) {
    return this.notifications.unsubscribeWebPush(user.id, dto.endpoint);
  }
}
