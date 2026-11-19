import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ReviewKind } from '@fatia/db';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { RequireGroupAction } from './decorators/require-group-action.decorator';
import {
  REVIEW_KIND_PARAMS,
  RiskDaysDto,
  RiskDigestDto,
  SessionFeedbackDto,
  type ReviewKindParam,
} from './dto/review.dto';
import { GroupRoleGuard } from './guards/group-role.guard';
import { ReviewService } from './review.service';

const KIND: Record<ReviewKindParam, ReviewKind> = {
  workout: ReviewKind.WORKOUT,
  goal: ReviewKind.GOAL,
  plan: ReviewKind.PLAN_RESPONSE,
};

/**
 * "Para revisar", "Em risco" e a sessão feita (#399). Sem tool MCP: a
 * administração da fila e do em risco fica fora do MCP, e não há escrita
 * entre contas pelo MCP. O aluno lê o comentário recebido no
 * `get_workout_session`, que é dele.
 *
 * Todo id da URL (sessão, meta, versão da oferta) só encontra: o service
 * confere que é de um membro ativo DESTA comunidade, e o dado de saúde passa
 * pela porta de leitura com o vínculo de quem olha.
 */
@Controller('groups/:groupId')
@UseGuards(GroupRoleGuard)
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  @Get('review')
  @RequireGroupAction('panel.review')
  queue(@CurrentUser() user: CurrentUserPayload, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.review.queue(user.id, groupId);
  }

  @Post('review/:kind/:refId/seen')
  @HttpCode(200)
  @RequireGroupAction('panel.review')
  seen(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('kind') kind: string,
    @Param('refId', ParseUUIDPipe) refId: string,
  ) {
    if (!(REVIEW_KIND_PARAMS as readonly string[]).includes(kind)) {
      throw new BadRequestException('Tipo de item inválido');
    }
    return this.review.markSeen(user.id, groupId, KIND[kind as ReviewKindParam], refId);
  }

  @Get('review/sessions/:sessionId')
  @RequireGroupAction('panel.review')
  session(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.review.session(user.id, groupId, sessionId);
  }

  @Post('review/sessions/:sessionId/feedback')
  @RequireGroupAction('panel.review')
  feedback(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: SessionFeedbackDto,
  ) {
    return this.review.sendFeedback(user.id, groupId, sessionId, dto);
  }

  @Get('at-risk')
  @RequireGroupAction('panel.review')
  atRisk(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.review.atRisk(user.id, groupId);
  }

  @Patch('at-risk/settings')
  @RequireGroupAction('group.update')
  settings(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: RiskDaysDto,
  ) {
    return this.review.setRiskDays(user.id, groupId, dto.riskDays);
  }

  @Put('at-risk/digest')
  @RequireGroupAction('panel.review')
  digest(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: RiskDigestDto,
  ) {
    return this.review.setDigest(user.id, groupId, dto.enabled);
  }
}
