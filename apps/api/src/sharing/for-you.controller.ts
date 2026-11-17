import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { RequireGroupAction } from './decorators/require-group-action.decorator';
import { ForYouService } from './for-you.service';
import { GroupRoleGuard } from './guards/group-role.guard';

/** A aba "Para você" da comunidade (#394, prancha Cm-20). */
@Controller('groups/:groupId/for-you')
@UseGuards(GroupRoleGuard)
export class ForYouController {
  constructor(private readonly forYou: ForYouService) {}

  @Get()
  @RequireGroupAction('post.read')
  get(@CurrentUser() user: CurrentUserPayload, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.forYou.get(user.id, groupId);
  }
}
