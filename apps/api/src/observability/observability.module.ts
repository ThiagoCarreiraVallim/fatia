import { Module } from '@nestjs/common';
import { McpMetricsService } from './mcp-metrics.service';

/**
 * Instrumentação manual. O bootstrap do SDK **não** mora aqui — ele precisa rodar antes do Nest
 * existir (ver `tracing.ts`), então este módulo só entrega os instrumentos aos serviços.
 */
@Module({
  providers: [McpMetricsService],
  exports: [McpMetricsService],
})
export class ObservabilityModule {}
