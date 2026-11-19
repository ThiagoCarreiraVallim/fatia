import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { AnnouncementService } from './announcement.service';
import { RequireGroupAction } from './decorators/require-group-action.decorator';
import { AnnouncementDto, AnnouncementParamDto } from './dto/post.dto';
import { GroupRoleGuard } from './guards/group-role.guard';

/** Comunicados da equipe (#394, prancha Pn-14): agora, agendados e repetidos. */
@Controller('groups/:groupId/announcements')
@UseGuards(GroupRoleGuard)
export class AnnouncementController {
  constructor(private readonly announcements: AnnouncementService) {}

  @Get()
  @RequireGroupAction('announcement.publish')
  list(@CurrentUser() user: CurrentUserPayload, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.announcements.list(user.id, groupId);
  }

  /** Limite semanal de avisos e se o e-mail está ligado (#398). */
  @Get('settings')
  @RequireGroupAction('announcement.publish')
  settings(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.announcements.settings(user.id, groupId);
  }

  /** Os últimos que saíram, com mandadas, entregues e e-mails (#398). */
  @Get('recent')
  @RequireGroupAction('announcement.publish')
  recent(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.announcements.recent(user.id, groupId);
  }

  @Post()
  @RequireGroupAction('announcement.publish')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60 * 60_000, limit: 20 } })
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: AnnouncementDto,
  ) {
    return this.announcements.create(user.id, groupId, dto);
  }

  @Delete(':id')
  @RequireGroupAction('announcement.publish')
  cancel(@CurrentUser() user: CurrentUserPayload, @Param() p: AnnouncementParamDto) {
    return this.announcements.cancel(user.id, p.groupId, p.id);
  }
}
