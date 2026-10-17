import { Global, Module } from '@nestjs/common';
import { BillingModule } from './billing/billing.module';
import { SeatPoolService } from './billing/seat-pool.service';
import { UserSubscriptionService } from './billing/user-subscription.service';
import { GROUP_DELETION_HOOKS, type GroupDeletionHook } from './sharing/group-deletion.hook';
import { MediaService } from './storage/media.service';
import { StorageModule } from './storage/storage.module';
import { ACCOUNT_DELETION_HOOKS, type AccountDeletionHook } from './users/account-deletion.hook';

/**
 * Os ganchos que outros módulos penduram antes de apagar uma conta ou uma
 * comunidade, como provider global — para `users/` e `sharing/` recebê-los sem
 * importar `billing/` nem `storage/`.
 *
 * A ordem importa: a cobrança vem primeiro e pode abortar (seguir cobrando
 * depois de apagar seria o pior resultado). Os arquivos do bucket vêm depois.
 */
@Global()
@Module({
  imports: [BillingModule, StorageModule],
  providers: [
    {
      provide: ACCOUNT_DELETION_HOOKS,
      useFactory: (
        assinaturas: UserSubscriptionService,
        assentos: SeatPoolService,
        media: MediaService,
      ): AccountDeletionHook[] => [
        { beforeDelete: (userId) => assinaturas.encerrarAntesDeApagar(userId) },
        // As comunidades de que a pessoa é dona caem em cascata com a conta:
        // a cobrança dos assentos delas acaba antes (ADR 025).
        { beforeDelete: (userId) => assentos.encerrarAntesDeApagarConta(userId) },
        // E os arquivos pessoais e das comunidades dela saem do bucket (ADR 028).
        { beforeDelete: (userId) => media.beforeDeleteAccount(userId) },
      ],
      inject: [UserSubscriptionService, SeatPoolService, MediaService],
    },
    {
      provide: GROUP_DELETION_HOOKS,
      useFactory: (assentos: SeatPoolService, media: MediaService): GroupDeletionHook[] => [
        { beforeDelete: (groupId) => assentos.encerrarAntesDeApagarGrupo(groupId) },
        { beforeDelete: (groupId) => media.beforeDeleteGroup(groupId) },
      ],
      inject: [SeatPoolService, MediaService],
    },
  ],
  exports: [ACCOUNT_DELETION_HOOKS, GROUP_DELETION_HOOKS],
})
export class DeletionHooksModule {}
