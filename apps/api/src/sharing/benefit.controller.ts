import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { BenefitService } from './benefit.service';
import { RequireGroupAction } from './decorators/require-group-action.decorator';
import { BenefitParamDto, CreateBenefitDto, UpdateBenefitDto } from './dto/benefit.dto';
import { GroupRoleGuard } from './guards/group-role.guard';

/**
 * Benefícios de parceiros (#393). `benefits` é a vitrine do membro (só o que
 * vale, filtrado no servidor); `benefits/manage` e a escrita são do dono.
 * Sem tool MCP de escrita: administração da comunidade fica fora do MCP.
 */
@Controller('groups/:groupId/benefits')
@UseGuards(GroupRoleGuard)
export class BenefitController {
  constructor(private readonly benefits: BenefitService) {}

  @Get()
  @RequireGroupAction('benefit.read')
  list(@CurrentUser() user: CurrentUserPayload, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.benefits.listForMember(user.id, groupId);
  }

  @Get('manage')
  @RequireGroupAction('benefit.manage')
  listForTeam(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.benefits.listForTeam(user.id, groupId);
  }

  @Post()
  @RequireGroupAction('benefit.manage')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateBenefitDto,
  ) {
    return this.benefits.create(user.id, groupId, dto);
  }

  @Patch(':benefitId')
  @RequireGroupAction('benefit.manage')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: BenefitParamDto,
    @Body() dto: UpdateBenefitDto,
  ) {
    return this.benefits.update(user.id, p.groupId, p.benefitId, dto);
  }

  @Delete(':benefitId')
  @RequireGroupAction('benefit.manage')
  remove(@CurrentUser() user: CurrentUserPayload, @Param() p: BenefitParamDto) {
    return this.benefits.remove(user.id, p.groupId, p.benefitId);
  }
}
