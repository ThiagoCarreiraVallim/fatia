import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { RequireGroupAction } from './decorators/require-group-action.decorator';
import { SendParamDto, SendPlansDto, SendRecipientsQueryDto } from './dto/plan-send.dto';
import { GroupRoleGuard } from './guards/group-role.guard';
import { PlanSendService } from './plan-send.service';

/**
 * Enviar para alunos (#405, Pn-18 e Pn-08b). `sends` e não `offers`: as
 * Ofertas vendidas da #403 já moram em `groups/:groupId/offers`. O lado do
 * aluno continua em `/plan-offers` (#379) e `/nutrition/plan` (#376).
 *
 * Administração da equipe: fica fora do MCP.
 */
@Controller('groups/:groupId/sends')
@UseGuards(GroupRoleGuard)
export class PlanSendController {
  constructor(private readonly sends: PlanSendService) {}

  @Get('recipients')
  @RequireGroupAction('member.plans')
  recipients(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: SendRecipientsQueryDto,
  ) {
    return this.sends.recipients(user.id, groupId, query.templateId);
  }

  @Get()
  @RequireGroupAction('member.plans')
  list(@CurrentUser() user: CurrentUserPayload, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.sends.list(user.id, groupId);
  }

  @Post()
  @RequireGroupAction('member.plans')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  send(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: SendPlansDto,
  ) {
    return this.sends.send(user.id, groupId, dto);
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @RequireGroupAction('member.plans')
  revoke(@CurrentUser() user: CurrentUserPayload, @Param() p: SendParamDto) {
    return this.sends.revoke(user.id, p.groupId, p.id);
  }
}
