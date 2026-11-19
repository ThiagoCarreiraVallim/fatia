import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsString, MaxLength } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { AnnouncementEmailService } from './announcement-email.service';

class UnsubscribeQueryDto {
  @IsString()
  @MaxLength(200)
  t!: string;
}

class UnsubscribeDto extends UnsubscribeQueryDto {
  @IsBoolean()
  subscribed!: boolean;
}

/**
 * O link de descadastro do e-mail de comunicado (#398), sem login: o token
 * assinado é a prova. Ler não muda nada (leitores de link dos provedores abrem
 * o endereço sozinhos); quem descadastra é o botão da página, com POST.
 */
@Controller('email/announcements')
export class AnnouncementEmailController {
  constructor(private readonly mail: AnnouncementEmailService) {}

  @Get('subscription')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  // O ThrottlerModule não é APP_GUARD: sem o guard de rota, o @Throttle é inerte.
  @UseGuards(UserThrottlerGuard)
  status(@Query() q: UnsubscribeQueryDto) {
    return this.mail.status(q.t);
  }

  @Post('subscription')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseGuards(UserThrottlerGuard)
  set(@Body() dto: UnsubscribeDto) {
    return this.mail.setSubscribed(dto.t, dto.subscribed);
  }
}
