import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { CommunitySetupService } from './community-setup.service';
import { RequireGroupAction, SelfOnly } from './decorators/require-group-action.decorator';
import { SetupGuideDto, SetupStepDto, SetupStepParamDto, SlugCheckQueryDto } from './dto/setup.dto';
import { GroupRoleGuard } from './guards/group-role.guard';

/**
 * Onboarding de quem cria a comunidade (#372): o endereço livre do nome
 * (Onb-C1) e o checklist de primeiros passos do dono (Onb-C3,
 * Onb-Criador-Web, Pn-21d). Registrado antes do `SharingController` para
 * `slug-check` não cair em `groups/:groupId`.
 *
 * Sem tool MCP: administrar a comunidade fica fora do MCP.
 */
@Controller('groups')
export class SetupController {
  constructor(private readonly setup: CommunitySetupService) {}

  /** O slug é público (link de convite): dizer que existe não vaza nada. */
  @Get('slug-check')
  @SelfOnly()
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  slugCheck(@Query() q: SlugCheckQueryDto) {
    return this.setup.slugCheck(q.name);
  }

  @Get(':groupId/setup')
  @UseGuards(GroupRoleGuard)
  @RequireGroupAction('group.setup')
  get(@CurrentUser() user: CurrentUserPayload, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.setup.get(user.id, groupId);
  }

  @Put(':groupId/setup/steps/:step')
  @UseGuards(GroupRoleGuard)
  @RequireGroupAction('group.setup')
  setStep(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: SetupStepParamDto,
    @Body() dto: SetupStepDto,
  ) {
    return this.setup.setStep(user.id, p.groupId, p.step, dto.done);
  }

  @Put(':groupId/setup/guide')
  @UseGuards(GroupRoleGuard)
  @RequireGroupAction('group.setup')
  setGuide(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: SetupGuideDto,
  ) {
    return this.setup.setGuide(user.id, groupId, dto.visible);
  }

  /** "Primeiros passos" (#412, Pn-21d): completo = comunidade ativa. */
  @Get(':groupId/first-steps')
  @UseGuards(GroupRoleGuard)
  @RequireGroupAction('panel.overview')
  firstSteps(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.setup.firstSteps(user.id, groupId);
  }
}
