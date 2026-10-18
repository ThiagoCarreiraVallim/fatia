import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { RequireGroupAction } from './decorators/require-group-action.decorator';
import { BanParamDto, ReportParamDto, ResolveReportDto } from './dto/post.dto';
import { GroupRoleGuard } from './guards/group-role.guard';
import { MembershipService } from './membership.service';
import { PostService } from './post.service';

/**
 * A fila de moderação do mural (Fase 8b): denúncias abertas, removidos
 * recentes e banidos. Quem modera (`content.moderate`) trata as denúncias;
 * banir é do dono (`member.ban`), como remover membro.
 */
@Controller('groups/:groupId/moderation')
@UseGuards(GroupRoleGuard)
export class ModerationController {
  constructor(
    private readonly posts: PostService,
    private readonly memberships: MembershipService,
  ) {}

  @Get('reports')
  @RequireGroupAction('content.moderate')
  reports(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.posts.reports(user.id, groupId);
  }

  @Post('reports/:reportId/resolve')
  @HttpCode(200)
  @RequireGroupAction('content.moderate')
  resolve(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: ReportParamDto,
    @Body() dto: ResolveReportDto,
  ) {
    return this.posts.resolveReport(user.id, p.groupId, p.reportId, dto.action);
  }

  @Get('removed')
  @RequireGroupAction('content.moderate')
  removed(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.posts.removed(user.id, groupId);
  }

  @Get('bans')
  @RequireGroupAction('member.ban')
  bans(@CurrentUser() user: CurrentUserPayload, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.memberships.listBanned(user.id, groupId);
  }

  @Post('bans/:membershipId')
  @HttpCode(200)
  @RequireGroupAction('member.ban')
  ban(@CurrentUser() user: CurrentUserPayload, @Param() p: BanParamDto) {
    return this.memberships.ban(user.id, p.groupId, p.membershipId);
  }

  @Delete('bans/:membershipId')
  @RequireGroupAction('member.ban')
  unban(@CurrentUser() user: CurrentUserPayload, @Param() p: BanParamDto) {
    return this.memberships.unban(user.id, p.groupId, p.membershipId);
  }
}
