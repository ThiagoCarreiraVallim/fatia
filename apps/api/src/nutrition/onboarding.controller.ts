import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CompleteOnboardingDto } from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';

/** O assistente de primeira vez. Mora aqui porque o que ele grava são metas. */
@Controller('users/me/onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post()
  @HttpCode(200)
  complete(@CurrentUser() user: CurrentUserPayload, @Body() dto: CompleteOnboardingDto) {
    return this.onboarding.complete(user.id, dto, user.timezone);
  }

  @Post('skip')
  @HttpCode(200)
  skip(@CurrentUser() user: CurrentUserPayload) {
    return this.onboarding.skip(user.id);
  }
}
