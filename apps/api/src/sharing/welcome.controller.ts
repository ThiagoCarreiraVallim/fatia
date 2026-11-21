import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { RequireGroupAction } from './decorators/require-group-action.decorator';
import { SaveWelcomeDto } from './dto/welcome.dto';
import { GroupRoleGuard } from './guards/group-role.guard';
import { WelcomeService } from './welcome.service';

/**
 * Páginas de boas-vindas da comunidade (#410). O editor (`GET`/`PUT`) é de quem
 * publica conteúdo; `pages` é a leitura do membro em Comunidade → Sobre, só do
 * que está publicado. Quem tem o convite lê pelo `GET /groups/invites/:token`.
 * Sem tool MCP: administração da comunidade fica fora do MCP.
 */
@Controller('groups/:groupId/welcome')
@UseGuards(GroupRoleGuard)
export class WelcomeController {
  constructor(private readonly welcome: WelcomeService) {}

  @Get()
  @RequireGroupAction('content.publish')
  editor(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.welcome.editor(user.id, groupId);
  }

  @Put()
  @RequireGroupAction('content.publish')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  save(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: SaveWelcomeDto,
  ) {
    return this.welcome.save(user.id, groupId, dto);
  }

  @Get('pages')
  @RequireGroupAction('content.read')
  pages(@CurrentUser() user: CurrentUserPayload, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.welcome.forMember(user.id, groupId);
  }
}
