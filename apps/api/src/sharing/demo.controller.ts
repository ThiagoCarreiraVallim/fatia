import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { RequireGroupAction, SelfOnly } from './decorators/require-group-action.decorator';
import { DemoService } from './demo.service';
import { GroupRoleGuard } from './guards/group-role.guard';

/**
 * A comunidade de demonstração e os primeiros passos (#412, Pn-21 a Pn-21d).
 *
 * A demo é **da pessoa**, não de uma comunidade: as rotas de `groups/demo`
 * olham só o usuário autenticado (uma demo por dona), e nenhum id chega pelo
 * corpo. Registrado antes do `SharingController` para `demo` não cair em
 * `groups/:groupId`.
 *
 * Sem tool MCP (#412): administrar a comunidade fica fora do MCP, e a Ana
 * Exemplo não tem token do MCP.
 */
@Controller('groups')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Get('demo')
  @SelfOnly()
  get(@CurrentUser() user: CurrentUserPayload) {
    return this.demo.get(user.id);
  }

  /** Idempotente: a segunda chamada devolve a demo que já existe. */
  @Post('demo')
  @SelfOnly()
  @HttpCode(200)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  create(@CurrentUser() user: CurrentUserPayload) {
    return this.demo.create(user.id);
  }

  @Delete('demo')
  @SelfOnly()
  remove(@CurrentUser() user: CurrentUserPayload) {
    return this.demo.remove(user.id);
  }

  /** "Abrir no app como Ana Exemplo": um token de 30 minutos, só leitura. */
  @Post('demo/session')
  @SelfOnly()
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  openSession(@CurrentUser() user: CurrentUserPayload) {
    return this.demo.openSession(user.id);
  }

  @Get(':groupId/first-steps')
  @UseGuards(GroupRoleGuard)
  @RequireGroupAction('panel.overview')
  firstSteps(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.demo.firstSteps(user.id, groupId);
  }
}
