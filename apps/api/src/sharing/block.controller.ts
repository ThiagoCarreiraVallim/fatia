import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { BlockService } from './block.service';
import { SelfOnly } from './decorators/require-group-action.decorator';
import { BlockDto, BlockParamDto } from './dto/post.dto';

/**
 * Bloquear pessoa (#394, Apple 1.2). Sem `GroupRoleGuard`: o bloqueio é da
 * conta e vale em todas as comunidades; o `BlockService` confere que quem
 * bloqueia é membro ativo da comunidade do post.
 */
@Controller('users/me/blocks')
export class BlockController {
  constructor(private readonly blocks: BlockService) {}

  @Get()
  @SelfOnly()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.blocks.list(user.id);
  }

  @Post()
  @SelfOnly()
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60 * 60_000, limit: 60 } })
  block(@CurrentUser() user: CurrentUserPayload, @Body() dto: BlockDto) {
    return this.blocks.block(user.id, dto);
  }

  @Delete(':id')
  @SelfOnly()
  unblock(@CurrentUser() user: CurrentUserPayload, @Param() p: BlockParamDto) {
    return this.blocks.unblock(user.id, p.id);
  }
}
