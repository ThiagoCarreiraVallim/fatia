import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { GroupService } from './group.service';
import { MembershipService } from './membership.service';
import { ApproveMemberDto, CreateGroupDto, JoinGroupDto } from './dto/group.dto';

/**
 * Superfície REST do B2B (ADR 014).
 *
 * Criar grupo, aprovar entrada e remover membro existem **só aqui**, sem tool
 * MCP correspondente, e isso é decisão de segurança e não preguiça: painel de
 * dono é superfície B2B, não é o app do usuário — nenhuma tool passa a poder
 * criar grupo nem colocar alguém dentro de um. Ver `docs/MCP_TOOL_SURFACE.md`.
 */
@Controller('groups')
export class SharingController {
  constructor(
    private readonly groups: GroupService,
    private readonly memberships: MembershipService,
  ) {}

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateGroupDto) {
    return this.groups.create(user.id, dto);
  }

  @Get()
  listMine(@CurrentUser() user: CurrentUserPayload) {
    return this.groups.listMine(user.id);
  }

  /** Preview pelo slug, antes de pedir para entrar. Só metadado do grupo. */
  @Get('preview')
  preview(@Query('slug') slug: string) {
    return this.groups.previewBySlug(slug);
  }

  @Get(':groupId')
  get(@CurrentUser() user: CurrentUserPayload, @Param('groupId') groupId: string) {
    return this.groups.findByIdForMember(user.id, groupId);
  }

  @Get(':groupId/members')
  listMembers(@CurrentUser() user: CurrentUserPayload, @Param('groupId') groupId: string) {
    return this.memberships.listMembers(user.id, groupId);
  }

  /** Pedido de entrada do próprio usuário. Quem entra é sempre quem chamou. */
  @Post('join')
  join(@CurrentUser() user: CurrentUserPayload, @Body() dto: JoinGroupDto) {
    return this.memberships.requestJoin(user.id, dto.slug);
  }

  @Post(':groupId/members/:membershipId/approve')
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
  leave(@CurrentUser() user: CurrentUserPayload, @Param('groupId') groupId: string) {
    return this.memberships.leave(user.id, groupId);
  }

  @Delete(':groupId/members/:membershipId')
  removeMember(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.memberships.removeMember(user.id, groupId, membershipId);
  }
}
