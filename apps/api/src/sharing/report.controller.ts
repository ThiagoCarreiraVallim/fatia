import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { RequireGroupAction } from './decorators/require-group-action.decorator';
import {
  OriginsQueryDto,
  ReportQueryDto,
  ReportRecipientDto,
  ReportSettingsDto,
} from './dto/report.dto';
import { GroupRoleGuard } from './guards/group-role.guard';
import { ReportService } from './report.service';

/**
 * Relatório do mês e origens dos convites (#400). Só o dono, por enquanto (os
 * outros papéis ficam com a #404). Sem tool MCP: relatório e origens são
 * administração da comunidade. O PDF é gerado no navegador, do mesmo JSON.
 */
@Controller('groups/:groupId')
@UseGuards(GroupRoleGuard)
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  @Get('report')
  @RequireGroupAction('insights.read')
  report(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() q: ReportQueryDto,
  ) {
    return this.reports.report(user.id, groupId, q.month);
  }

  @Get('report/settings')
  @RequireGroupAction('group.update')
  settings(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.reports.settings(user.id, groupId);
  }

  @Patch('report/settings')
  @RequireGroupAction('group.update')
  updateSettings(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: ReportSettingsDto,
  ) {
    return this.reports.updateSettings(user.id, groupId, dto);
  }

  @Put('report/recipients/:membershipId')
  @RequireGroupAction('group.update')
  recipient(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: ReportRecipientDto,
  ) {
    return this.reports.setRecipient(user.id, groupId, membershipId, dto.enabled);
  }

  @Get('invites/origins')
  @RequireGroupAction('insights.read')
  origins(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() q: OriginsQueryDto,
  ) {
    return this.reports.origins(user.id, groupId, q.days ?? 30);
  }
}
