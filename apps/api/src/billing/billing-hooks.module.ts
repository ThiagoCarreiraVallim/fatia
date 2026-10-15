import { Global, Module } from '@nestjs/common';
import { ACCOUNT_DELETION_HOOKS, type AccountDeletionHook } from '../users/account-deletion.hook';
import { BillingModule } from './billing.module';
import { UserSubscriptionService } from './user-subscription.service';

/**
 * Os ganchos que a cobrança pendura em outros fluxos, como provider global —
 * para o lado da conta recebê-los sem importar `billing/`.
 */
@Global()
@Module({
  imports: [BillingModule],
  providers: [
    {
      provide: ACCOUNT_DELETION_HOOKS,
      useFactory: (assinaturas: UserSubscriptionService): AccountDeletionHook[] => [
        { antesDeApagar: (userId) => assinaturas.encerrarAntesDeApagar(userId) },
      ],
      inject: [UserSubscriptionService],
    },
  ],
  exports: [ACCOUNT_DELETION_HOOKS],
})
export class BillingHooksModule {}
