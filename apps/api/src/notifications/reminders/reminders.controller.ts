import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationService } from '../notification.service';
import {
  CreateReminderDto,
  QuietHoursDto,
  ReminderParamDto,
  UpdateReminderDto,
} from './reminder.dto';
import { ReminderService } from './reminder.service';

/**
 * Lembretes pessoais e silêncio noturno de quem está logado (#389, pranchas
 * Al-V2/V3). Só o próprio: o id de outra pessoa responde 404.
 */
@Controller('users/me')
export class RemindersController {
  constructor(
    private readonly reminders: ReminderService,
    private readonly notifications: NotificationService,
  ) {}

  @Get('reminders')
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.reminders.list(user.id);
  }

  @Post('reminders')
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateReminderDto) {
    return this.reminders.create(user.id, dto);
  }

  @Patch('reminders/:id')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: ReminderParamDto,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.reminders.update(user.id, p.id, dto);
  }

  @Delete('reminders/:id')
  remove(@CurrentUser() user: CurrentUserPayload, @Param() p: ReminderParamDto) {
    return this.reminders.remove(user.id, p.id);
  }

  @Put('quiet-hours')
  quietHours(@CurrentUser() user: CurrentUserPayload, @Body() dto: QuietHoursDto) {
    return this.notifications.setQuietHours(user.id, dto);
  }
}
