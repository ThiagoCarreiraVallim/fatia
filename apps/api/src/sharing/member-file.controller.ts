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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { RequireGroupAction, SelfOnly } from './decorators/require-group-action.decorator';
import {
  MemberAgendaQueryDto,
  MemberNoteDto,
  RemoveMemberPlanQueryDto,
  ReorderMemberPlansDto,
  SavePlanCopyDto,
  SendMemberPlanDto,
} from './dto/member-file.dto';
import { GroupRoleGuard } from './guards/group-role.guard';
import { MemberFileService } from './member-file.service';
import { MemberNoteService } from './member-note.service';
import { PlanCopyService } from './plan-copy.service';
import { PlanOfferService } from './plan-offer.service';

/**
 * A ficha da pessoa no painel (#402, Pn-05). Sem tool MCP: administrar a
 * comunidade fica fora do MCP.
 *
 * O `:membershipId` só encontra a pessoa; os services conferem que ela é
 * DESTA comunidade (`resolveMemberTarget`) antes de qualquer leitura, e o dado
 * de saúde passa pela porta de leitura com o vínculo de quem olha.
 */
@Controller('groups/:groupId/members/:membershipId')
@UseGuards(GroupRoleGuard)
export class MemberFileController {
  constructor(
    private readonly files: MemberFileService,
    private readonly offers: PlanOfferService,
    private readonly notes: MemberNoteService,
    private readonly copies: PlanCopyService,
  ) {}

  @Get('file')
  @RequireGroupAction('member.file')
  file(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.files.file(user.id, groupId, membershipId);
  }

  @Get('agenda')
  @RequireGroupAction('member.file')
  agenda(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Query() query: MemberAgendaQueryDto,
  ) {
    return this.files.agenda(user.id, groupId, membershipId, query.from, query.to);
  }

  @Post('plans')
  @RequireGroupAction('member.plans')
  sendPlan(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: SendMemberPlanDto,
  ) {
    return this.offers.sendToMember(user.id, groupId, membershipId, dto);
  }

  @Put('plans/order')
  @RequireGroupAction('member.plans')
  reorderPlans(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: ReorderMemberPlansDto,
  ) {
    return this.offers.reorderForMember(user.id, groupId, membershipId, dto.offerIds);
  }

  /** A cópia da pessoa no editor (#406, Pn-09e). Passa pela porta de leitura de Treino. */
  @Get('plan-offers/:offerId/copy')
  @RequireGroupAction('member.plans')
  planCopy(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    return this.copies.get(user.id, groupId, membershipId, offerId);
  }

  /** "Salvar na cópia da Ana": versão nova; a pessoa vê o que mudou e aceita. */
  @Put('plan-offers/:offerId/copy')
  @RequireGroupAction('member.plans')
  savePlanCopy(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Body() dto: SavePlanCopyDto,
  ) {
    return this.copies.save(user.id, groupId, membershipId, offerId, dto);
  }

  @Delete('plans/:offerId')
  @RequireGroupAction('member.plans')
  removePlan(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Query() query: RemoveMemberPlanQueryDto,
  ) {
    return this.offers.removeForMember(user.id, groupId, membershipId, offerId, {
      notify: query.notify ?? false,
      endToday: query.endToday ?? false,
    });
  }

  @Get('notes')
  @RequireGroupAction('member.file')
  listNotes(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.notes.list(user.id, groupId, membershipId);
  }

  @Post('notes')
  @RequireGroupAction('member.note')
  createNote(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: MemberNoteDto,
  ) {
    return this.notes.create(user.id, groupId, membershipId, dto.text);
  }

  @Patch('notes/:noteId')
  @RequireGroupAction('member.note')
  updateNote(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() dto: MemberNoteDto,
  ) {
    return this.notes.update(user.id, groupId, membershipId, noteId, dto.text);
  }

  @Delete('notes/:noteId')
  @HttpCode(204)
  @RequireGroupAction('member.note')
  async removeNote(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ) {
    await this.notes.remove(user.id, groupId, membershipId, noteId);
  }
}

/**
 * As anotações da equipe sobre quem chama (#402), só leitura: aparecem no app
 * em Comunidade → Sobre. `@SelfOnly`: o dado é de quem chama, procurado pelo
 * `userId` dele; o `:groupId` só escolhe a comunidade, e o service exige
 * associação ativa nela.
 */
@Controller('groups/:groupId/my-notes')
@UseGuards(GroupRoleGuard)
export class MyMemberNotesController {
  constructor(private readonly notes: MemberNoteService) {}

  @Get()
  @SelfOnly()
  mine(@CurrentUser() user: CurrentUserPayload, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.notes.mine(user.id, groupId);
  }
}
