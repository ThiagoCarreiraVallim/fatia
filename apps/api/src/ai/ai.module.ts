import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { AiAccessService } from './ai-access.service';
import { AiUsageService } from './ai-usage.service';

/**
 * IA hospedada: cota (`AiUsageService`) e portão de plano (`AiAccessService`).
 *
 * Um módulo só, para que chat e foto de refeição usem **a mesma** cota e o
 * mesmo portão. Antes o `AiUsageService` vivia só no `ChatModule`, e a foto
 * ficou sem cota nenhuma.
 */
@Module({
  imports: [BillingModule],
  providers: [AiUsageService, AiAccessService],
  exports: [AiUsageService, AiAccessService],
})
export class AiModule {}
