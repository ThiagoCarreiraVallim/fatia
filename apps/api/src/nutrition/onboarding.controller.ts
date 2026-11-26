import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CompleteOnboardingDto, SaveOnboardingDto } from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';

/** O assistente de primeira vez. Mora aqui porque o que ele grava são metas. */
@Controller('users/me/onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  /** Onde a pessoa parou, já preenchido (retomada, #371). */
  @Get()
  progress(@CurrentUser() user: CurrentUserPayload) {
    return this.onboarding.getProgress(user.id);
  }

  /** Salva a cada passo: a etapa atual e o que já foi respondido. */
  @Patch()
  save(@CurrentUser() user: CurrentUserPayload, @Body() dto: SaveOnboardingDto) {
    return this.onboarding.saveProgress(user.id, dto, user.timezone);
  }

  @Post()
  @HttpCode(200)
  complete(@CurrentUser() user: CurrentUserPayload, @Body() dto: CompleteOnboardingDto) {
    return this.onboarding.complete(user.id, dto, user.timezone);
  }

  /** Fim das etapas puláveis: sai da retomada e liga o cartão "Primeiros passos". */
  @Post('finish')
  @HttpCode(200)
  finish(@CurrentUser() user: CurrentUserPayload) {
    return this.onboarding.finish(user.id);
  }

  @Post('skip')
  @HttpCode(200)
  skip(@CurrentUser() user: CurrentUserPayload) {
    return this.onboarding.skip(user.id);
  }

  /** O cartão "Primeiros passos" do Hoje; `null` para quem não o tem. */
  @Get('first-steps')
  firstSteps(@CurrentUser() user: CurrentUserPayload) {
    return this.onboarding.firstSteps(user.id, user.timezone);
  }
}
