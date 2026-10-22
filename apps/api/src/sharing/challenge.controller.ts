import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { ChallengeService } from './challenge.service';
import { RequireGroupAction } from './decorators/require-group-action.decorator';
import { ChallengeDto, ChallengeParamDto, JoinChallengeDto } from './dto/challenge.dto';
import { GroupRoleGuard } from './guards/group-role.guard';

/**
 * Desafios da comunidade (Fase 8a, ADR 027). Todo membro ativo lista, entra e
 * sai (`challenge.join`); a equipe marca, muda antes de começar, encerra e
 * apaga (`challenge.manage`). O ranking só vai para quem entrou.
 */
@Controller('groups/:groupId/challenges')
@UseGuards(GroupRoleGuard)
export class ChallengeController {
  constructor(private readonly challenges: ChallengeService) {}

  @Get()
  @RequireGroupAction('challenge.join')
  list(@CurrentUser() user: CurrentUserPayload, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.challenges.list(user.id, groupId);
  }

  @Post()
  @RequireGroupAction('challenge.manage')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: ChallengeDto,
  ) {
    return this.challenges.create(user.id, groupId, dto);
  }

  @Get(':id')
  @RequireGroupAction('challenge.join')
  get(@CurrentUser() user: CurrentUserPayload, @Param() p: ChallengeParamDto) {
    return this.challenges.get(user.id, p.groupId, p.id);
  }

  @Patch(':id')
  @RequireGroupAction('challenge.manage')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: ChallengeParamDto,
    @Body() dto: ChallengeDto,
  ) {
    return this.challenges.update(user.id, p.groupId, p.id, dto);
  }

  @Post(':id/end')
  @HttpCode(200)
  @RequireGroupAction('challenge.manage')
  end(@CurrentUser() user: CurrentUserPayload, @Param() p: ChallengeParamDto) {
    return this.challenges.end(user.id, p.groupId, p.id);
  }

  @Delete(':id')
  @RequireGroupAction('challenge.manage')
  remove(@CurrentUser() user: CurrentUserPayload, @Param() p: ChallengeParamDto) {
    return this.challenges.remove(user.id, p.groupId, p.id);
  }

  @Post(':id/join')
  @HttpCode(200)
  @RequireGroupAction('challenge.join')
  join(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: ChallengeParamDto,
    @Body() dto: JoinChallengeDto,
  ) {
    return this.challenges.join(user.id, p.groupId, p.id, dto.displayName);
  }

  @Delete(':id/join')
  @RequireGroupAction('challenge.join')
  leave(@CurrentUser() user: CurrentUserPayload, @Param() p: ChallengeParamDto) {
    return this.challenges.leave(user.id, p.groupId, p.id);
  }
}
