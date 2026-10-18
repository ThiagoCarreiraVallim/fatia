import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { RequireGroupAction } from './decorators/require-group-action.decorator';
import { GroupAgentDto } from './dto/group-agent.dto';
import { GroupAgentService } from './group-agent.service';
import { GroupRoleGuard } from './guards/group-role.guard';

/**
 * O agente da comunidade no chat (Fase 7c, ADR 031). Só o dono configura
 * (`group.update`); quem escolhe o agente é o membro, pelo `/chat/agents`.
 */
@Controller('groups/:groupId/agent')
@UseGuards(GroupRoleGuard)
export class GroupAgentController {
  constructor(private readonly agents: GroupAgentService) {}

  @Get()
  @RequireGroupAction('group.update')
  get(@CurrentUser() user: CurrentUserPayload, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.agents.get(user.id, groupId);
  }

  @Put()
  @RequireGroupAction('group.update')
  put(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: GroupAgentDto,
  ) {
    return this.agents.put(user.id, groupId, dto);
  }
}
