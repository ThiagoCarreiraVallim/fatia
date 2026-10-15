import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { RequireGroupAction } from '../sharing/decorators/require-group-action.decorator';
import { GroupRoleGuard } from '../sharing/guards/group-role.guard';
import { ChangeSeatsDto, SeatCheckoutDto, SeatMembershipParamDto } from './dto/seats.dto';
import { SeatPoolService } from './seat-pool.service';

/**
 * Assentos de IA pagos pela comunidade (ADR 025). Só o dono (`billing.*` na
 * matriz de `docs/PERMISSIONS.md`); fora do MCP, como toda administração de
 * comunidade. A tela é do painel da Fase 6; até lá, REST e o script de dev.
 */
@Controller('groups/:groupId/seats')
@UseGuards(GroupRoleGuard)
export class SeatController {
  constructor(private readonly assentos: SeatPoolService) {}

  @Get()
  @RequireGroupAction('billing.read')
  overview(@Param('groupId') groupId: string) {
    return this.assentos.overview(groupId);
  }

  /** Abre a compra no Asaas e devolve o link da primeira cobrança. */
  @Post('checkout')
  @HttpCode(200)
  @RequireGroupAction('billing.manage')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  checkout(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId') groupId: string,
    @Body() dto: SeatCheckoutDto,
  ) {
    return this.assentos.checkout(user.id, groupId, dto);
  }

  @Patch()
  @RequireGroupAction('billing.manage')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  change(@Param('groupId') groupId: string, @Body() dto: ChangeSeatsDto) {
    return this.assentos.changeSeats(groupId, dto.seats);
  }

  @Post('cancel')
  @HttpCode(200)
  @RequireGroupAction('billing.manage')
  cancel(@Param('groupId') groupId: string) {
    return this.assentos.cancel(groupId);
  }

  @Post('assignments/:membershipId')
  @HttpCode(200)
  @RequireGroupAction('billing.manage')
  assign(@CurrentUser() user: CurrentUserPayload, @Param() p: SeatMembershipParamDto) {
    return this.assentos.assign(user.id, p.groupId, p.membershipId);
  }

  @Delete('assignments/:membershipId')
  @RequireGroupAction('billing.manage')
  unassign(@Param() p: SeatMembershipParamDto) {
    return this.assentos.unassign(p.groupId, p.membershipId);
  }
}
