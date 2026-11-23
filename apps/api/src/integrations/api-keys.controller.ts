import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { RequireGroupAction } from '../sharing/decorators/require-group-action.decorator';
import { GroupRoleGuard } from '../sharing/guards/group-role.guard';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/integrations.dto';

/**
 * Integrações e API no painel (#413, Pn-38): as chaves da comunidade e a cota
 * do mês. Só o dono (`integration.manage`); o service confere de novo.
 */
@Controller('groups')
@UseGuards(GroupRoleGuard)
export class ApiKeysController {
  constructor(private readonly keys: ApiKeyService) {}

  @Get(':groupId/api-keys')
  @RequireGroupAction('integration.manage')
  list(@CurrentUser() user: CurrentUserPayload, @Param('groupId') groupId: string) {
    return this.keys.list(user.id, groupId);
  }

  // O ThrottlerModule não é APP_GUARD: sem o guard de rota, o @Throttle é inerte.
  @Post(':groupId/api-keys')
  @RequireGroupAction('integration.manage')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60 * 60_000, limit: 20 } })
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.keys.create(user.id, groupId, dto);
  }

  @Delete(':groupId/api-keys/:keyId')
  @RequireGroupAction('integration.manage')
  revoke(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Param('keyId', ParseUUIDPipe) keyId: string,
  ) {
    return this.keys.revoke(user.id, groupId, keyId);
  }
}
