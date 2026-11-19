import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsString, MaxLength } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { AnnouncementEmailService } from './announcement-email.service';
import { UnsubscribeThrottlerGuard } from './unsubscribe-throttler.guard';

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
 * o endereço sozinhos); quem descadastra é o botão da página, com POST, ou o
 * provedor de e-mail pelo POST de um clique (`List-Unsubscribe-Post`, RFC 8058).
 *
 * O teto é por link (`UnsubscribeThrottlerGuard`), não por IP: a web chama
 * pelo servidor, e o IP seria o mesmo para todo mundo.
 */
@Controller('email/announcements')
export class AnnouncementEmailController {
  constructor(private readonly mail: AnnouncementEmailService) {}

  @Get('subscription')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  // O ThrottlerModule não é APP_GUARD: sem o guard de rota, o @Throttle é inerte.
  @UseGuards(UnsubscribeThrottlerGuard)
  status(@Query() q: UnsubscribeQueryDto) {
    return this.mail.status(q.t);
  }

  @Post('subscription')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseGuards(UnsubscribeThrottlerGuard)
  set(@Body() dto: UnsubscribeDto) {
    return this.mail.setSubscribed(dto.t, dto.subscribed);
  }

  /** O provedor manda `List-Unsubscribe=One-Click` no corpo; o token vem na URL. */
  @Post('one-click')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseGuards(UnsubscribeThrottlerGuard)
  async oneClick(@Query() q: UnsubscribeQueryDto, @Body() body: Record<string, unknown>) {
    if (body?.['List-Unsubscribe'] !== 'One-Click') {
      throw new BadRequestException('Corpo de um clique ausente');
    }
    return this.mail.setSubscribed(q.t, false);
  }
}
