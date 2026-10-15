import { Body, Controller, Get, Headers, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { CheckoutDto } from './dto/checkout.dto';
import { RevenueCatService } from './revenuecat/revenuecat.service';
import { UserSubscriptionService } from './user-subscription.service';

/**
 * Plano Free/PRO da pessoa (ADR 024).
 *
 * Fora do MCP de propósito: a regra "o MCP não tem vocabulário de cobrança"
 * continua (`no-billing-in-student-surface.spec.ts`). Quem usa o Fatia pela
 * própria IA nunca vê preço.
 */
@Controller('billing')
export class BillingController {
  constructor(
    private readonly assinaturas: UserSubscriptionService,
    private readonly revenueCat: RevenueCatService,
  ) {}

  /** O plano como a tela "Meu plano" mostra. */
  @Get('plan')
  plan(@CurrentUser() user: CurrentUserPayload) {
    return this.assinaturas.plano(user.id);
  }

  /** Abre o checkout do Asaas (Pix, boleto ou cartão) e devolve o link. */
  @Post('checkout')
  @HttpCode(200)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  checkout(@CurrentUser() user: CurrentUserPayload, @Body() dto: CheckoutDto) {
    return this.assinaturas.checkout(user.id, dto);
  }

  @Post('cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: CurrentUserPayload) {
    return this.assinaturas.cancelar(user.id);
  }

  /**
   * O app chama logo depois da compra na loja, para liberar o PRO na hora em
   * vez de esperar o webhook. Só sincroniza a pessoa autenticada.
   */
  @Post('revenuecat/sync')
  @HttpCode(200)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async revenueCatSync(@CurrentUser() user: CurrentUserPayload) {
    await this.revenueCat.sincronizar(user.id);
    return this.assinaturas.plano(user.id);
  }

  /** Webhook da RevenueCat. Autenticado pelo header `Authorization` do painel. */
  @Public()
  @Post('webhooks/revenuecat')
  @HttpCode(200)
  revenueCatWebhook(@Headers('authorization') auth: string | undefined, @Req() req: Request) {
    return this.revenueCat.processarWebhook(auth, corpoCru(req));
  }

  /**
   * Webhook do Asaas. Público por natureza; a autenticação é o token no header
   * `asaas-access-token`, conferido em tempo constante. O corpo chega cru
   * (`corpos-do-webhook.ts`), porque quem autentica precisa dos mesmos bytes.
   */
  @Public()
  @Post('webhooks/asaas')
  @HttpCode(200)
  asaas(@Headers() headers: Record<string, string | undefined>, @Req() req: Request) {
    return this.assinaturas.processarWebhookAsaas(headers, corpoCru(req));
  }
}

/** O corpo como texto, seja qual for o `Content-Type` que o provedor mandou. */
export function corpoCru(req: Request): string {
  const corpo: unknown = req.body;
  if (typeof corpo === 'string') return corpo;
  if (Buffer.isBuffer(corpo)) return corpo.toString('utf8');
  return '';
}
