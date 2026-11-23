import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { GroupRoleGuard } from '../sharing/guards/group-role.guard';
import { ApiKeyGuard, ApiKeyThrottlerGuard } from './api-key.guard';
import { ApiKeyService } from './api-key.service';
import { ApiKeysController } from './api-keys.controller';
import { ApiCallRetention } from './api-call-retention';
import { IntegrationApiController } from './integration-api.controller';
import { IntegrationReadService } from './integration-read.service';

/**
 * Integrações e API da comunidade (#413, Pn-38). Como o `InsightsModule`, não
 * importa o `SharingModule`: usa só o `GroupRoleGuard`, e nada daqui tem
 * caminho até a leitura de dado de saúde (`ProfessionalAccessService`).
 */
@Module({
  imports: [CommonModule],
  controllers: [ApiKeysController, IntegrationApiController],
  providers: [
    ApiKeyService,
    IntegrationReadService,
    ApiKeyGuard,
    ApiKeyThrottlerGuard,
    GroupRoleGuard,
    ApiCallRetention,
  ],
})
export class IntegrationsModule {}
