import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { GroupService } from './group.service';
import { MembershipService } from './membership.service';
import { ApproveMemberDto, CreateGroupDto, JoinGroupDto, PreviewGroupDto } from './dto/group.dto';
import { RequireGroupAction, SelfOnly } from './decorators/require-group-action.decorator';
import { GroupRoleGuard } from './guards/group-role.guard';

/**
 * Superfície REST do B2B (ADR 014).
 *
 * Criar grupo, aprovar entrada e remover membro existem **só aqui**, sem tool
 * MCP correspondente, e isso é decisão de segurança e não preguiça: painel de
 * dono é superfície B2B, não é o app do usuário — nenhuma tool passa a poder
 * criar grupo nem colocar alguém dentro de um. Ver `docs/MCP_TOOL_SURFACE.md`.
 *
 * Todo método daqui declara **`@RequireGroupAction` ou `@SelfOnly`**, sem
 * terceiro estado (#156). O guarda confere papel contra a matriz de
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
    return this.memberships.requestJoin(user.id, dto.slug);
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
