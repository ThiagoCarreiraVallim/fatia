import { Global, Module } from '@nestjs/common';
import { GROUP_DELETION_HOOKS, type GroupDeletionHook } from '../sharing/group-deletion.hook';
import { ACCOUNT_DELETION_HOOKS, type AccountDeletionHook } from '../users/account-deletion.hook';
import { BillingModule } from './billing.module';
import { SeatPoolService } from './seat-pool.service';
import { UserSubscriptionService } from './user-subscription.service';

/**
 * Os ganchos que a cobrança pendura em outros fluxos, como provider global —
 * para a conta e a comunidade recebê-los sem importar `billing/`.
 */
@Global()
@Module({
  imports: [BillingModule],
  providers: [
    {
      provide: ACCOUNT_DELETION_HOOKS,
      useFactory: (
        assinaturas: UserSubscriptionService,
        assentos: SeatPoolService,
      ): AccountDeletionHook[] => [
        { antesDeApagar: (userId) => assinaturas.encerrarAntesDeApagar(userId) },
        // As comunidades de que a pessoa é dona caem em cascata com a conta:
        // a cobrança dos assentos delas acaba antes (ADR 025).
        { antesDeApagar: (userId) => assentos.encerrarAntesDeApagarConta(userId) },
      ],
      inject: [UserSubscriptionService, SeatPoolService],
    },
    {
      provide: GROUP_DELETION_HOOKS,
      useFactory: (assentos: SeatPoolService): GroupDeletionHook[] => [
        { antesDeApagar: (groupId) => assentos.encerrarAntesDeApagarGrupo(groupId) },
      ],
      inject: [SeatPoolService],
    },
  ],
  exports: [ACCOUNT_DELETION_HOOKS, GROUP_DELETION_HOOKS],
})
export class BillingHooksModule {}
