import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { RequireGroupAction } from '../sharing/decorators/require-group-action.decorator';
import { GroupRoleGuard } from '../sharing/guards/group-role.guard';
import { CreateOfferDto, UpdateOfferDto } from './dto/offer.dto';
import { OfferService } from './offer.service';

/**
 * Ofertas (#403, Pn-37 e Pn-37b): o que a comunidade vende. Dinheiro da
 * comunidade: só o dono (`billing.*`), fora do MCP e fora do app (o app não
 * vende fora da loja).
 */
@Controller('groups/:groupId/offers')
@UseGuards(GroupRoleGuard)
export class OfferController {
  constructor(private readonly offers: OfferService) {}

  @Get()
  @RequireGroupAction('billing.read')
  list(@Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.offers.list(groupId);
  }

  @Post()
  @RequireGroupAction('billing.manage')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateOfferDto,
  ) {
    return this.offers.create(user.id, groupId, dto);
  }

  @Patch(':offerId')
  @RequireGroupAction('billing.manage')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Body() dto: UpdateOfferDto,
  ) {
    return this.offers.update(user.id, groupId, offerId, dto);
  }

  @Post(':offerId/publish')
  @RequireGroupAction('billing.manage')
  publish(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    return this.offers.publish(user.id, groupId, offerId);
  }

  @Post(':offerId/close')
  @RequireGroupAction('billing.manage')
  close(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    return this.offers.close(user.id, groupId, offerId);
  }

  @Post(':offerId/duplicate')
  @RequireGroupAction('billing.manage')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  duplicate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    return this.offers.duplicate(user.id, groupId, offerId);
  }

  @Post(':offerId/purchases/:purchaseId/resend')
  @RequireGroupAction('billing.manage')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  resend(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
  ) {
    return this.offers.resendLink(user.id, groupId, offerId, purchaseId);
  }
}
