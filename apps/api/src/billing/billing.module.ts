import { Module } from '@nestjs/common';
import { AsaasProvider } from './asaas/asaas.provider';
import { GroupRoleGuard } from '../sharing/guards/group-role.guard';
import { BillingController } from './billing.controller';
import { RevenueCatService } from './revenuecat/revenuecat.service';
import { SeatController } from './seat.controller';
import { SEAT_PROVIDER, SeatPoolService } from './seat-pool.service';
import { SUBSCRIPTION_PROVIDER, UserSubscriptionService } from './user-subscription.service';
import { BillingEntitlements } from './entitlements.port';
import { StaticEntitlementsService } from './static-entitlements.service';
import {
  AiEntitlements,
  SubscriptionEntitlementsService,
} from './subscription-entitlements.service';

/**
 * Cobrança: o add-on de insights do grupo (`BillingEntitlements`, #160) e o
 * plano Free/PRO da pessoa (ADR 024) — o direito à IA (`AiEntitlements`), a
 * assinatura pela web no Asaas e o webhook.
 *
 * Também os assentos de comunidade (ADR 025): uma assinatura por comunidade,
 * com o `GroupRoleGuard` declarado aqui como provider (sem importar o
 * `SharingModule`, como o `InsightsModule`).
 *
 * O portão da IA mora em `ai/` e só depende de `AiEntitlements`; nenhum módulo
 * do lado do aluno importa este (`no-billing-in-student-surface.spec.ts`).
 */
@Module({
  controllers: [BillingController, SeatController],
  providers: [
    { provide: BillingEntitlements, useClass: StaticEntitlementsService },
    { provide: AiEntitlements, useClass: SubscriptionEntitlementsService },
    // Sem as três variáveis do Asaas (ou em teste), o provedor não nasce e o
    // checkout responde 503; o resto do plano continua funcionando.
    {
      provide: SUBSCRIPTION_PROVIDER,
      useFactory: () => {
        const env = process.env;
        if (env.NODE_ENV === 'test') return null;
        if (!env.ASAAS_BASE_URL || !env.ASAAS_API_KEY || !env.ASAAS_WEBHOOK_TOKEN) return null;
        return AsaasProvider.fromEnv(env);
      },
    },
    // O mesmo AsaasProvider, pela porta de assentos.
    {
      provide: SEAT_PROVIDER,
      useFactory: (p: AsaasProvider | null) => p,
      inject: [SUBSCRIPTION_PROVIDER],
    },
    UserSubscriptionService,
    SeatPoolService,
    RevenueCatService,
    GroupRoleGuard,
  ],
  exports: [BillingEntitlements, AiEntitlements, UserSubscriptionService, SeatPoolService],
})
export class BillingModule {}
