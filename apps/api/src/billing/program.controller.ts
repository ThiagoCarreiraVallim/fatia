import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { RequireGroupAction } from '../sharing/decorators/require-group-action.decorator';
import { GroupRoleGuard } from '../sharing/guards/group-role.guard';
import { CreateProgramDto } from './dto/program.dto';
import { ProgramService } from './program.service';

/**
 * Programas (#403, Pn-07): PRO por período para uma turma ou um desafio. É
 * dinheiro da comunidade: só o dono (`billing.*`), fora do MCP.
 */
@Controller('groups/:groupId/programs')
@UseGuards(GroupRoleGuard)
export class ProgramController {
  constructor(private readonly programs: ProgramService) {}

  @Get()
  @RequireGroupAction('billing.read')
  list(@Param('groupId') groupId: string) {
    return this.programs.list(groupId);
  }

  @Post()
  @RequireGroupAction('billing.manage')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Body() dto: CreateProgramDto,
  ) {
    return this.programs.create(user.id, groupId, dto);
  }
}
