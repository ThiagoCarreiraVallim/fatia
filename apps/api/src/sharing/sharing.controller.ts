import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { ConsentService } from './consent.service';
import { ContentService } from './content.service';
import { GroupService } from './group.service';
import { InviteService } from './invite.service';
import { MemberAdminService } from './member-admin.service';
import { MembershipService } from './membership.service';
import { TeamService } from './team.service';
import {
  ApproveMemberDto,
  BatchInviteDto,
  ChangeRoleDto,
  CreateGroupDto,
  CreateInviteDto,
  InviteTokenParamDto,
  JoinConsentDto,
  JoinGroupDto,
  ListMembersQueryDto,
  MemberBulkDto,
  PendingInvitesQueryDto,
  PreviewGroupDto,
  ResendInvitesDto,
  SetAccompaniedByDto,
  SetAvatarDto,
  SetSpecialtyDto,
  TransferOwnershipDto,
  UpdateGroupDto,
} from './dto/group.dto';
import { GroupConsentDto } from './dto/consent.dto';
import {
  InvitePreview,
  RequireGroupAction,
  SelfOnly,
} from './decorators/require-group-action.decorator';
import { GroupRoleGuard } from './guards/group-role.guard';

/**
 * Superfície REST do B2B (ADR 014).
 *
 * Criar grupo, aprovar entrada e remover membro existem **só aqui**, sem tool
 * MCP correspondente, e isso é decisão de segurança e não preguiça: painel de
 * dono é superfície B2B, não é o app do usuário — nenhuma tool passa a poder
 * criar grupo nem colocar alguém dentro de um. Ver `docs/MCP_TOOL_SURFACE.md`.
 *
 * Todo método daqui declara **`@RequireGroupAction`, `@SelfOnly` ou
 * `@InvitePreview`**, sem estado "nenhum" (#156). O guarda confere papel contra a matriz de
 * `docs/PERMISSIONS.md`; as rotas `@SelfOnly` agem sobre quem chamou e não têm
 * papel a conferir. O `assertOwner` dos services **fica**: o guarda protege a
 * rota HTTP, o service continua protegido quando chamado de qualquer outro
 * lugar.
 */
@Controller('groups')
@UseGuards(GroupRoleGuard)
export class SharingController {
  constructor(
    private readonly groups: GroupService,
    private readonly memberships: MembershipService,
    private readonly invites: InviteService,
    private readonly consents: ConsentService,
    private readonly content: ContentService,
    private readonly memberAdmin: MemberAdminService,
    private readonly teamAdmin: TeamService,
  ) {}

  @Post()
  @SelfOnly()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateGroupDto) {
    return this.groups.create(user.id, dto);
  }

  @Get()
  @SelfOnly()
  listMine(@CurrentUser() user: CurrentUserPayload) {
    return this.groups.listMine(user.id);
  }

  /**
   * Modelos das comunidades (Al-T23, #379): os planos de treino publicados de
   * todas as comunidades em que quem chama é membro ativo. Antes de `:groupId`,
   * senão "templates" seria lido como id de comunidade.
   */
  @Get('templates')
  @SelfOnly()
  listTemplates(@CurrentUser() user: CurrentUserPayload) {
    return this.content.listWorkoutTemplatesForMe(user.id);
  }

  /**
   * Preview pelo código (o legível da equipe ou o slug, #393), antes de pedir
   * para entrar. Só metadado do grupo. Throttle: o código é curto, e a rota
   * não pode virar máquina de adivinhar.
   *
   * `@Query()` com DTO, e não `@Query('slug')`: primitivo avulso escapa do
   * `ValidationPipe` global e a chamada sem slug morria em 500 no Prisma.
   */
  @Get('preview')
  @SelfOnly()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  // O ThrottlerModule não é APP_GUARD: sem o guard de rota, o @Throttle é inerte.
  @UseGuards(UserThrottlerGuard)
  preview(@Query() q: PreviewGroupDto) {
    return this.groups.previewByCode(q.code ?? q.slug ?? '');
  }

  /**
   * Cartão do convite, sem login: quem recebeu o link vê que comunidade o
   * convidou antes de criar conta. Inválido, expirado, revogado e esgotado dão
   * o mesmo 404. Throttle baixo: o token é o segredo, e a rota não pode virar
   * máquina de adivinhar.
   */
  @Get('invites/:token')
  @InvitePreview()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  // O ThrottlerModule não é APP_GUARD: sem o guard de rota, o @Throttle é inerte.
  @UseGuards(UserThrottlerGuard)
  previewInvite(@Param() p: InviteTokenParamDto) {
    return this.invites.preview(p.token);
  }

  /**
   * Recusar o convite nominal (#401; a tela é a Onb-E1, #372). Só a conta do
   * e-mail convidado recusa; link de vários usos e convite de outro e-mail dão 404.
   */
  @Post('invites/:token/decline')
  @SelfOnly()
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  // O ThrottlerModule não é APP_GUARD: sem o guard de rota, o @Throttle é inerte.
  @UseGuards(UserThrottlerGuard)
  declineInvite(@CurrentUser() user: CurrentUserPayload, @Param() p: InviteTokenParamDto) {
    return this.invites.decline(user.id, p.token);
  }

  /** Aceitar: quem entra é sempre quem chamou, com o consentimento que escolheu. */
  @Post('invites/:token/accept')
  @SelfOnly()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  // O ThrottlerModule não é APP_GUARD: sem o guard de rota, o @Throttle é inerte.
  @UseGuards(UserThrottlerGuard)
  acceptInvite(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: InviteTokenParamDto,
    @Body() dto: JoinConsentDto,
  ) {
    return this.invites.accept(user.id, p.token, {
      scopes: dto.scopes ?? [],
      statsOptIn: dto.statsOptIn ?? false,
    });
  }

  @Get(':groupId')
  @RequireGroupAction('group.read')
  get(@CurrentUser() user: CurrentUserPayload, @Param('groupId') groupId: string) {
    return this.groups.findByIdForMember(user.id, groupId);
  }

  @Get(':groupId/members')
  @RequireGroupAction('member.list')
  listMembers(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Query() q: ListMembersQueryDto,
  ) {
    return this.memberships.listMembers(user.id, groupId, { includeLeft: q.include === 'left' });
  }

  /**
   * Ação em massa sobre membros (#401, Pn-04d): trocar responsável, dar ou
   * tirar assento. Até 100 ids, todos amarrados à comunidade da URL; o service
   * confere a ação de cada uma (`member.assign` ou `billing.manage`).
   */
  @Post(':groupId/members/bulk')
  @RequireGroupAction('member.assign')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  // O ThrottlerModule não é APP_GUARD: sem o guard de rota, o @Throttle é inerte.
  @UseGuards(UserThrottlerGuard)
  bulkMembers(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Body() dto: MemberBulkDto,
  ) {
    return this.memberAdmin.bulk(user.id, groupId, dto);
  }

  /** Quem da equipe acompanha este membro (#401); `null` = ninguém. */
  @Put(':groupId/members/:membershipId/accompanied-by')
  @RequireGroupAction('member.assign')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @UseGuards(UserThrottlerGuard)
  setAccompaniedBy(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: SetAccompaniedByDto,
  ) {
    return this.memberAdmin.setAccompaniedBy(
      user.id,
      groupId,
      membershipId,
      dto.accompaniedByMembershipId,
    );
  }

  /**
   * A equipe vista por quem pergunta (#393, Cm-04): o que cada um vê dele e
   * quando olhou por último. Nunca outros alunos, nunca o dado de outra pessoa.
   */
  @Get(':groupId/team')
  @RequireGroupAction('group.read')
  team(@CurrentUser() user: CurrentUserPayload, @Param('groupId') groupId: string) {
    return this.memberships.teamForMember(user.id, groupId);
  }

  /**
   * A tela Equipe do painel (#404, Pn-19): a equipe por papel, especialidade,
   * quantos acompanha e o último acesso; o histórico de mudanças só ao dono.
   */
  @Get(':groupId/staff')
  @RequireGroupAction('member.role')
  staff(@CurrentUser() user: CurrentUserPayload, @Param('groupId') groupId: string) {
    return this.teamAdmin.staff(user.id, groupId);
  }

  /** "O que cada papel pode fazer" (#404), calculado da matriz do guarda. */
  @Get(':groupId/permissions')
  @RequireGroupAction('group.read')
  permissions() {
    return this.teamAdmin.permissions();
  }

  /** A especialidade do profissional (#404); nutrição recorta o vínculo. */
  @Patch(':groupId/members/:membershipId/specialty')
  @RequireGroupAction('member.role')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  // O ThrottlerModule não é APP_GUARD: sem o guard de rota, o @Throttle é inerte.
  @UseGuards(UserThrottlerGuard)
  setSpecialty(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: SetSpecialtyDto,
  ) {
    return this.teamAdmin.setSpecialty(user.id, groupId, membershipId, dto.specialty);
  }

  /** Pedido de entrada do próprio usuário. Quem entra é sempre quem chamou. */
  @Post('join')
  @SelfOnly()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  // O ThrottlerModule não é APP_GUARD: sem o guard de rota, o @Throttle é inerte.
  @UseGuards(UserThrottlerGuard)
  join(@CurrentUser() user: CurrentUserPayload, @Body() dto: JoinGroupDto) {
    return this.memberships.requestJoin(user.id, dto.code ?? dto.slug ?? '', {
      scopes: dto.scopes ?? [],
      statsOptIn: dto.statsOptIn ?? false,
    });
  }

  @Patch(':groupId')
  @RequireGroupAction('group.update')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groups.update(user.id, groupId, dto);
  }

  /** Troca (ou tira, com `null`) o avatar. O arquivo já foi enviado por `/media/uploads`. */
  @Put(':groupId/avatar')
  @RequireGroupAction('group.update')
  setAvatar(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Body() dto: SetAvatarDto,
  ) {
    return this.groups.setAvatar(user.id, groupId, dto.fileId);
  }

  /** Troca (ou tira, com `null`) a capa (#413). O arquivo já foi enviado por `/media/uploads`. */
  @Put(':groupId/cover')
  @RequireGroupAction('group.update')
  setCover(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Body() dto: SetAvatarDto,
  ) {
    return this.groups.setCover(user.id, groupId, dto.fileId);
  }

  @Delete(':groupId')
  @RequireGroupAction('group.delete')
  remove(@CurrentUser() user: CurrentUserPayload, @Param('groupId') groupId: string) {
    return this.groups.remove(user.id, groupId);
  }

  @Post(':groupId/owner')
  @RequireGroupAction('group.transfer')
  @HttpCode(200)
  transfer(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Body() dto: TransferOwnershipDto,
  ) {
    return this.groups.transferOwnership(user.id, groupId, dto.membershipId);
  }

  /**
   * O que eu compartilho com a equipe desta comunidade (ADR 026). Age sobre a
   * própria associação; reescrever substitui os vínculos que eu tinha no grupo.
   */
  @Put(':groupId/consent')
  @SelfOnly()
  setConsent(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Body() dto: GroupConsentDto,
  ) {
    return this.consents.setGroupConsent(user.id, groupId, dto);
  }

  @Post(':groupId/invites')
  @RequireGroupAction('invite.create')
  createInvite(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.invites.create(user.id, groupId, dto);
  }

  /** Convite em lote, por e-mail. O inválido volta em `skipped`, não derruba o lote. */
  @Post(':groupId/invites/batch')
  @RequireGroupAction('invite.create')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  // O ThrottlerModule não é APP_GUARD: sem o guard de rota, o @Throttle é inerte.
  @UseGuards(UserThrottlerGuard)
  createInviteBatch(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Body() dto: BatchInviteDto,
  ) {
    return this.invites.createBatch(user.id, groupId, dto);
  }

  @Get(':groupId/invites')
  @RequireGroupAction('invite.create')
  listInvites(@CurrentUser() user: CurrentUserPayload, @Param('groupId') groupId: string) {
    return this.invites.list(user.id, groupId);
  }

  /** Tela Convites (#401, Pn-06): cartões, convites ativos e inativos, e os números de cada um. */
  @Get(':groupId/invites/overview')
  @RequireGroupAction('invite.create')
  invitesOverview(@CurrentUser() user: CurrentUserPayload, @Param('groupId') groupId: string) {
    return this.invites.overview(user.id, groupId);
  }

  /** Ativação pendente (#401, Pn-22): convites por e-mail sem aceite há 2 dias ou mais. */
  @Get(':groupId/invites/pending')
  @RequireGroupAction('invite.create')
  pendingInvites(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Query() q: PendingInvitesQueryDto,
  ) {
    return this.invites.pending(user.id, groupId, q);
  }

  /** Reenviar vários (Pn-22). Cada um troca o link; o que não dá volta em `skipped`. */
  @Post(':groupId/invites/resend')
  @RequireGroupAction('invite.create')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  // O ThrottlerModule não é APP_GUARD: sem o guard de rota, o @Throttle é inerte.
  @UseGuards(UserThrottlerGuard)
  resendInvites(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Body() dto: ResendInvitesDto,
  ) {
    return this.invites.resendMany(user.id, groupId, dto.inviteIds);
  }

  /** "Enviar convite novo" para o convite por e-mail que venceu (Pn-22). */
  @Post(':groupId/invites/:inviteId/renew')
  @RequireGroupAction('invite.create')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  // O ThrottlerModule não é APP_GUARD: sem o guard de rota, o @Throttle é inerte.
  @UseGuards(UserThrottlerGuard)
  renewInvite(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Param('inviteId') inviteId: string,
  ) {
    return this.invites.renew(user.id, groupId, inviteId);
  }

  /** Link novo do convite por e-mail, sem e-mail, para mandar pelo WhatsApp (Pn-22). */
  @Post(':groupId/invites/:inviteId/link')
  @RequireGroupAction('invite.create')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  // O ThrottlerModule não é APP_GUARD: sem o guard de rota, o @Throttle é inerte.
  @UseGuards(UserThrottlerGuard)
  freshInviteLink(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Param('inviteId') inviteId: string,
  ) {
    return this.invites.freshLink(user.id, groupId, inviteId);
  }

  @Delete(':groupId/invites/:inviteId')
  @RequireGroupAction('invite.revoke')
  revokeInvite(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Param('inviteId') inviteId: string,
  ) {
    return this.invites.revoke(user.id, groupId, inviteId);
  }

  @Post(':groupId/invites/:inviteId/resend')
  @RequireGroupAction('invite.create')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  // Sem o guard de rota o @Throttle é inerte (o ThrottlerModule não é APP_GUARD).
  @UseGuards(UserThrottlerGuard)
  resendInvite(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Param('inviteId') inviteId: string,
  ) {
    return this.invites.resend(user.id, groupId, inviteId);
  }

  @Post(':groupId/members/:membershipId/approve')
  @RequireGroupAction('member.approve')
  approve(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: ApproveMemberDto,
  ) {
    return this.memberships.approve(user.id, groupId, membershipId, dto.role);
  }

  /** Sair. Rota própria, sem id de membership: só dá para sair de si mesmo. */
  @Delete(':groupId/members/me')
  @SelfOnly()
  leave(@CurrentUser() user: CurrentUserPayload, @Param('groupId') groupId: string) {
    return this.memberships.leave(user.id, groupId);
  }

  /**
   * Mudar o papel de quem já está dentro; os vínculos acompanham (ADR 026). O
   * dono e o administrador (#404), cada um com o seu limite.
   */
  @Patch(':groupId/members/:membershipId')
  @RequireGroupAction('member.role')
  changeRole(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.memberships.changeRole(user.id, groupId, membershipId, dto.role);
  }

  @Delete(':groupId/members/:membershipId')
  @RequireGroupAction('member.remove')
  removeMember(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.memberships.removeMember(user.id, groupId, membershipId);
  }
}
