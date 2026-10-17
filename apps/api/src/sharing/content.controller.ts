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
import { ContentService } from './content.service';
import { RequireGroupAction } from './decorators/require-group-action.decorator';
import {
  AdoptDto,
  ContentParamDto,
  CreateNutritionTemplateDto,
  CreateTipDto,
  CreateWorkoutTemplateDto,
  PublishDto,
  TipStateDto,
  UpdateTemplateDto,
  UpdateTipDto,
} from './dto/content.dto';
import { GroupRoleGuard } from './guards/group-role.guard';

/**
 * Planos prontos e dicas da comunidade (Fase 7a).
 *
 * `content/...` é a bancada da equipe (`content.publish`): rascunhos, edição,
 * publicar. `plans` e `tips` são a vitrine do membro (`content.read`): só o que
 * está publicado. O membro adota pelo REST e pelo MCP (`adopt_group_plan`).
 */
@Controller('groups/:groupId')
@UseGuards(GroupRoleGuard)
export class ContentController {
  constructor(private readonly content: ContentService) {}

  // ---- equipe

  @Get('content/plans')
  @RequireGroupAction('content.publish')
  teamPlans(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.content.listTemplatesForTeam(user.id, groupId);
  }

  @Get('content/plans/:id')
  @RequireGroupAction('content.publish')
  teamPlan(@CurrentUser() user: CurrentUserPayload, @Param() p: ContentParamDto) {
    return this.content.getTemplateForTeam(user.id, p.groupId, p.id);
  }

  @Post('content/plans/workout')
  @RequireGroupAction('content.publish')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  createWorkout(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateWorkoutTemplateDto,
  ) {
    return this.content.createWorkoutTemplate(user.id, groupId, dto);
  }

  @Post('content/plans/nutrition')
  @RequireGroupAction('content.publish')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  createNutrition(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateNutritionTemplateDto,
  ) {
    return this.content.createNutritionTemplate(user.id, groupId, dto);
  }

  @Patch('content/plans/:id')
  @RequireGroupAction('content.publish')
  updatePlan(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: ContentParamDto,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.content.updateTemplate(user.id, p.groupId, p.id, dto);
  }

  @Post('content/plans/:id/publish')
  @HttpCode(200)
  @RequireGroupAction('content.publish')
  publishPlan(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: ContentParamDto,
    @Body() dto: PublishDto,
  ) {
    return this.content.setTemplatePublished(user.id, p.groupId, p.id, dto.published);
  }

  @Delete('content/plans/:id')
  @RequireGroupAction('content.publish')
  deletePlan(@CurrentUser() user: CurrentUserPayload, @Param() p: ContentParamDto) {
    return this.content.deleteTemplate(user.id, p.groupId, p.id);
  }

  @Get('content/tips')
  @RequireGroupAction('content.publish')
  teamTips(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.content.listTipsForTeam(user.id, groupId);
  }

  @Post('content/tips')
  @RequireGroupAction('content.publish')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  createTip(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateTipDto,
  ) {
    return this.content.createTip(user.id, groupId, dto);
  }

  @Patch('content/tips/:id')
  @RequireGroupAction('content.publish')
  updateTip(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: ContentParamDto,
    @Body() dto: UpdateTipDto,
  ) {
    return this.content.updateTip(user.id, p.groupId, p.id, dto);
  }

  @Post('content/tips/:id/state')
  @HttpCode(200)
  @RequireGroupAction('content.publish')
  tipState(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: ContentParamDto,
    @Body() dto: TipStateDto,
  ) {
    return this.content.setTipState(user.id, p.groupId, p.id, dto);
  }

  @Delete('content/tips/:id')
  @RequireGroupAction('content.publish')
  deleteTip(@CurrentUser() user: CurrentUserPayload, @Param() p: ContentParamDto) {
    return this.content.deleteTip(user.id, p.groupId, p.id);
  }

  // ---- membro

  @Get('plans')
  @RequireGroupAction('content.read')
  plans(@CurrentUser() user: CurrentUserPayload, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.content.listTemplatesForMember(user.id, groupId);
  }

  @Get('plans/:id')
  @RequireGroupAction('content.read')
  plan(@CurrentUser() user: CurrentUserPayload, @Param() p: ContentParamDto) {
    return this.content.getTemplateForMember(user.id, p.groupId, p.id);
  }

  @Post('plans/:id/adopt')
  @HttpCode(200)
  @RequireGroupAction('content.read')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  adopt(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: ContentParamDto,
    @Body() dto: AdoptDto,
  ) {
    return this.content.adopt(user.id, p.groupId, p.id, dto);
  }

  @Get('tips')
  @RequireGroupAction('content.read')
  tips(@CurrentUser() user: CurrentUserPayload, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.content.listTipsForMember(user.id, groupId);
  }
}
