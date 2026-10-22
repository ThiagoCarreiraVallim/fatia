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
import { ConsentService } from './consent.service';
import { GroupService } from './group.service';
import { InviteService } from './invite.service';
import { MembershipService } from './membership.service';
import {
  ApproveMemberDto,
  BatchInviteDto,
  ChangeRoleDto,
  CreateGroupDto,
  CreateInviteDto,
  InviteTokenParamDto,
  JoinConsentDto,
  JoinGroupDto,
  PreviewGroupDto,
  SetAvatarDto,
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
   * Preview pelo slug, antes de pedir para entrar. Só metadado do grupo.
   *
   * `@Query()` com DTO, e não `@Query('slug')`: primitivo avulso escapa do
   * `ValidationPipe` global e a chamada sem slug morria em 500 no Prisma.
   */
  @Get('preview')
  @SelfOnly()
  preview(@Query() q: PreviewGroupDto) {
    return this.groups.previewBySlug(q.slug);
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
  previewInvite(@Param() p: InviteTokenParamDto) {
    return this.invites.preview(p.token);
  }

  /** Aceitar: quem entra é sempre quem chamou, com o consentimento que escolheu. */
  @Post('invites/:token/accept')
  @SelfOnly()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
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
  listMembers(@CurrentUser() user: CurrentUserPayload, @Param('groupId') groupId: string) {
    return this.memberships.listMembers(user.id, groupId);
  }

  /** Pedido de entrada do próprio usuário. Quem entra é sempre quem chamou. */
  @Post('join')
  @SelfOnly()
  join(@CurrentUser() user: CurrentUserPayload, @Body() dto: JoinGroupDto) {
    return this.memberships.requestJoin(user.id, dto.slug, {
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

  /** Mudar o papel de quem já está dentro; os vínculos acompanham (ADR 026). */
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
