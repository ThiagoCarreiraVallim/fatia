import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { SelfOnly } from './decorators/require-group-action.decorator';
import { RespondPlanOfferDto } from './dto/plan-offer.dto';
import { GroupRoleGuard } from './guards/group-role.guard';
import { PlanOfferService } from './plan-offer.service';

/**
 * Plano de treino recebido da equipe, lado do aluno (#379, Al-T2 e Al-T2b).
 *
 * `@SelfOnly` em tudo: a oferta é dado de quem chama, e é procurada com o
 * `userId` dele. A versão que vem no corpo precisa ser da oferta da URL: id de
 * outra oferta responde como inexistente.
 */
@Controller('plan-offers')
@UseGuards(GroupRoleGuard)
export class PlanOfferController {
  constructor(private readonly offers: PlanOfferService) {}

  @Get()
  @SelfOnly()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.offers.list(user.id);
  }

  @Get(':id')
  @SelfOnly()
  get(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.get(user.id, id);
  }

  @Post(':id/accept')
  @HttpCode(200)
  @SelfOnly()
  accept(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondPlanOfferDto,
  ) {
    return this.offers.accept(user.id, id, dto.versionId, user.timezone);
  }

  @Post(':id/decline')
  @HttpCode(200)
  @SelfOnly()
  decline(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondPlanOfferDto,
  ) {
    return this.offers.decline(user.id, id, dto.versionId);
  }

  @Post(':id/undo-decline')
  @HttpCode(200)
  @SelfOnly()
  undoDecline(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondPlanOfferDto,
  ) {
    return this.offers.undoDecline(user.id, id, dto.versionId);
  }
}
