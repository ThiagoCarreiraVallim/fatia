import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  DeviceParamDto,
  NotificationPreferencesDto,
  RegisterDeviceDto,
} from './dto/notification.dto';
import { NotificationService } from './notification.service';

/** Os celulares e as preferências de aviso de quem está logado (Fase 8c, ADR 033). */
@Controller('users/me')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

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

  @Put('notifications')
  setPreferences(@CurrentUser() user: CurrentUserPayload, @Body() dto: NotificationPreferencesDto) {
    return this.notifications.setPreferences(user.id, dto);
  }
}
