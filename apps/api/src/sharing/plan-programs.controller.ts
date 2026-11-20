import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { RequireGroupAction } from './decorators/require-group-action.decorator';
import { GroupRoleGuard } from './guards/group-role.guard';
import { PlanProgramsService } from './plan-programs.service';

/**
 * Programas do painel (#403, Pn-30): os planos com começo e fim que a equipe
 * mandou, por aluno. Só leitura; sem tool MCP (é administração da comunidade).
 */
@Controller('groups/:groupId/plan-programs')
@UseGuards(GroupRoleGuard)
export class PlanProgramsController {
  constructor(private readonly programs: PlanProgramsService) {}

  @Get()
  @RequireGroupAction('member.file')
  list(@CurrentUser() user: CurrentUserPayload, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.programs.list(user.id, groupId);
  }
}
