import { Module } from '@nestjs/common';
import { BillingEntitlements } from './entitlements.port';
import { StaticEntitlementsService } from './static-entitlements.service';

/**
 * O mínimo de cobrança que a #160 precisa: uma porta e uma implementação.
 *
 * O motor de cobrança é a #158 e continua fora daqui. Este módulo existe para
 * que o painel pago dependa de um booleano com dono definido, em vez de um
 * `process.env` lido no meio de um guard.
 *
 * A troca, quando a #158 entrar, é uma linha: `useClass: SubscriptionEntitlements`.
 */
@Module({
  providers: [{ provide: BillingEntitlements, useClass: StaticEntitlementsService }],
  exports: [BillingEntitlements],
})
export class BillingModule {}
