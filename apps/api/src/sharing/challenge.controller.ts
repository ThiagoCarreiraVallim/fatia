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
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { ChallengeService } from './challenge.service';
import { ChallengeCheckinService } from './challenge-checkin.service';
import { RequireGroupAction } from './decorators/require-group-action.decorator';
import {
  ChallengeDto,
  ChallengeParamDto,
  CheckinParamDto,
  CreateCheckinDto,
  JoinChallengeDto,
  ResolveCheckinDto,
  ReviewQueryDto,
  WatchChallengeDto,
} from './dto/challenge.dto';
import { GroupRoleGuard } from './guards/group-role.guard';

/**
 * Desafios da comunidade (Fase 8a, ADR 027). Todo membro ativo lista, entra e
 * sai (`challenge.join`); a equipe marca, muda antes de começar, encerra e
 * apaga (`challenge.manage`). O ranking só vai para quem entrou.
 */
@Controller('groups/:groupId/challenges')
@UseGuards(GroupRoleGuard)
export class ChallengeController {
  constructor(
    private readonly challenges: ChallengeService,
    private readonly checkins: ChallengeCheckinService,
  ) {}

  /**
   * A fila "Para revisar" da comunidade (Pn-13, #395), só da equipe. Rota fixa
   * antes de `:id`. `?challengeId=` recorta um desafio.
   */
  @Get('review')
  @RequireGroupAction('challenge.review')
  reviewQueue(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() q: ReviewQueryDto,
  ) {
    return this.checkins.queue(user.id, groupId, q.challengeId);
  }

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
    return this.challenges.join(user.id, p.groupId, p.id, dto.displayName, {
      acceptPhotoTerms: dto.acceptPhotoTerms,
    });
  }

  @Delete(':id/join')
  @RequireGroupAction('challenge.join')
  leave(@CurrentUser() user: CurrentUserPayload, @Param() p: ChallengeParamDto) {
    return this.challenges.leave(user.id, p.groupId, p.id);
  }

  /** "Me avise quando começar" (Cm-08). */
  @Post(':id/watch')
  @HttpCode(200)
  @RequireGroupAction('challenge.join')
  watch(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: ChallengeParamDto,
    @Body() dto: WatchChallengeDto,
  ) {
    return this.challenges.watch(user.id, p.groupId, p.id, dto.on);
  }

  /** O que a câmera do check-in mostra antes da foto (Cm-18). */
  @Get(':id/checkins/eligibility')
  @RequireGroupAction('challenge.join')
  eligibility(@CurrentUser() user: CurrentUserPayload, @Param() p: ChallengeParamDto) {
    return this.checkins.eligibility(user.id, p.groupId, p.id);
  }

  /** Check-in com foto (Cm-18). A foto vem de `POST /media/uploads` (`challenge_checkin`). */
  @Post(':id/checkins')
  @RequireGroupAction('challenge.join')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  checkin(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: ChallengeParamDto,
    @Body() dto: CreateCheckinDto,
  ) {
    return this.checkins.create(user.id, p.groupId, p.id, dto);
  }

  /** "Não parece válido" (Cm-17): manda o check-in para a fila, sem ver a foto. */
  @Post(':id/checkins/:checkinId/flag')
  @HttpCode(200)
  @RequireGroupAction('challenge.join')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  flag(@CurrentUser() user: CurrentUserPayload, @Param() p: CheckinParamDto) {
    return this.checkins.flag(user.id, p.groupId, p.id, p.checkinId);
  }

  @Get(':id/review')
  @RequireGroupAction('challenge.review')
  challengeReview(@CurrentUser() user: CurrentUserPayload, @Param() p: ChallengeParamDto) {
    return this.checkins.queue(user.id, p.groupId, p.id);
  }

  /** "Vale" ou "Anular" com motivo (Pn-13). */
  @Post(':id/review/:checkinId/resolve')
  @HttpCode(200)
  @RequireGroupAction('challenge.review')
  resolve(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: CheckinParamDto,
    @Body() dto: ResolveCheckinDto,
  ) {
    return this.checkins.resolve(user.id, p.groupId, p.id, p.checkinId, dto);
  }
}
