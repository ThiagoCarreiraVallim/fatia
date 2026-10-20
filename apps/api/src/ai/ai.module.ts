import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { AgentAdapter } from './agent.adapter';
import { AiAccessService } from './ai-access.service';
import { AiUsageService } from './ai-usage.service';
import { HostedAiService } from './hosted-ai.service';
import { HttpAgentAdapter } from './http-agent.adapter';

/**
 * IA hospedada: portão de plano (`AiAccessService`), cota e livro-caixa
 * (`AiUsageService`), o cliente do agente (`AgentAdapter`) e o serviço que junta
 * os três (`HostedAiService`).
 *
 * **O `AgentAdapter` não é exportado.** Quem precisa de IA pede ao
 * `HostedAiService`, que passa pelo portão e grava o uso; um service de outro
 * módulo que tentasse chamar o agente direto não teria como recebê-lo.
 */
@Module({
  imports: [BillingModule],
  providers: [
    AiUsageService,
    AiAccessService,
    HostedAiService,
    { provide: AgentAdapter, useClass: HttpAgentAdapter },
  ],
  exports: [AiUsageService, AiAccessService, HostedAiService],
})
export class AiModule {}
