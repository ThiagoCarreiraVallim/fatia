import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CommonModule } from '../common/common.module';
import { BehaviorService } from './behavior.service';
import { EngagementService } from './engagement.service';
import { InsightsController } from './insights.controller';
import { InsightsExportService } from './insights-export.service';
import { InsightsService } from './insights.service';
import { RetentionService } from './retention.service';
import { GroupRoleGuard } from '../sharing/guards/group-role.guard';
import { InsightsAddonGuard } from './guards/insights-addon.guard';
import { NoStatsParticipation, StatsParticipation } from './stats-participation.port';

/**
 * Painel agregado do dono da academia (#159 e #160).
 *
 * O módulo **não** importa o `SharingModule`: ele usa só o `GroupRoleGuard`,
 * declarado aqui como provider. Importar sharing inteiro traria
 * `ProfessionalAccessService` para dentro de um módulo cujo ponto é não ter
 * caminho até o indivíduo — a dependência mais fácil de adicionar por engano
 * seria justamente a que quebra a promessa.
 *
 * Duas portas, as duas com implementação provisória e troca de uma linha:
 *
 * - `StatsParticipation` → `NoStatsParticipation` enquanto
 *   `GroupMembership.statsOptIn` não existir no schema (migration proposta na
 *   PR, não aplicada nesta rodada). Ninguém participa; todo painel responde
 *   "amostra insuficiente".
 * - `BillingEntitlements` → `StaticEntitlementsService` enquanto a #158 não
 *   existir.
 */
@Module({
  imports: [CommonModule, BillingModule],
  controllers: [InsightsController],
  providers: [
    { provide: StatsParticipation, useClass: NoStatsParticipation },
    EngagementService,
    RetentionService,
    BehaviorService,
    InsightsService,
    InsightsExportService,
    GroupRoleGuard,
    InsightsAddonGuard,
  ],
})
export class InsightsModule {}
