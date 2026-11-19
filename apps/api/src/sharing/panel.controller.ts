import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { RequireGroupAction } from './decorators/require-group-action.decorator';
import { OverviewQueryDto, PanelSearchQueryDto } from './dto/panel.dto';
import { GroupRoleGuard } from './guards/group-role.guard';
import { PanelService } from './panel.service';

/**
 * O painel base do redesign (#398): contadores do menu, Visão geral e busca
 * ⌘K. Sem tool MCP: administrar a comunidade fica fora do MCP.
 */
@Controller('groups/:groupId')
@UseGuards(GroupRoleGuard)
export class PanelController {
  constructor(private readonly panel: PanelService) {}

  @Get('panel/counts')
  @RequireGroupAction('panel.overview')
  counts(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.panel.counts(user.id, groupId);
  }

  @Get('overview')
  @RequireGroupAction('panel.overview')
  overview(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: OverviewQueryDto,
  ) {
    return this.panel.overview(user.id, groupId, query.days ?? 30);
  }

  @Get('search')
  @RequireGroupAction('panel.search')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 90 } })
  search(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: PanelSearchQueryDto,
  ) {
    return this.panel.search(user.id, groupId, query.q);
  }
}
