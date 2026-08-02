import { Injectable } from '@nestjs/common';
import { metrics, type Counter, type Histogram } from '@opentelemetry/api';

/**
 * Rótulos permitidos nas métricas de tool MCP.
 *
 * Esta lista é o contrato que o `mcp-metrics.service.spec.ts` verifica. O modo de falha que ela
 * existe para impedir é alguém acrescentar `userId` (ou o nome do alimento, ou o id da refeição)
 * "só para depurar": em Prometheus isso **não dá erro nenhum** — cria uma série nova por valor,
 * e o consumo de memória cresce até o container morrer, semanas depois e longe da causa. Vale
 * junto com a regra de LGPD: métrica registra a forma da operação, nunca o conteúdo.
 */
export const ALLOWED_MCP_METRIC_ATTRIBUTES: readonly string[] = [
  'tool',
  'success',
  'error.category',
];

export type McpToolOutcome = {
  tool: string;
  durationMs: number;
  success: boolean;
  /** Categoria do erro (`NOT_FOUND`, `INTERNAL`, ...) — nunca a mensagem, que carrega dado do usuário. */
  errorCategory?: string;
};

/**
 * Contador e histograma das chamadas de tool MCP.
 *
 * Fica ao lado do log que o `McpToolRegistry` já emite, não no lugar dele: o log responde "o que
 * aconteceu nesta chamada" e a métrica responde "como está o conjunto". A métrica é barata de
 * agregar por semanas; o log, não.
 *
 * Com `OTEL_EXPORTER_OTLP_ENDPOINT` vazio o meter global é no-op — os `add`/`record` abaixo
 * viram chamadas vazias, sem alocar nada.
 */
@Injectable()
export class McpMetricsService {
  private readonly calls: Counter;
  private readonly duration: Histogram;

  constructor() {
    const meter = metrics.getMeter('fatia.mcp');

    this.calls = meter.createCounter('mcp.tool.calls', {
      description: 'Chamadas de tool MCP, por tool e resultado',
    });

    this.duration = meter.createHistogram('mcp.tool.duration', {
      description: 'Duração das chamadas de tool MCP',
      unit: 's',
    });
  }

  record({ tool, durationMs, success, errorCategory }: McpToolOutcome): void {
    // `success` vira string porque em Prometheus todo rótulo é texto; booleano viraria "true"
    // de qualquer forma, e ser explícito evita surpresa na query.
    const attributes: Record<string, string> = { tool, success: String(success) };
    if (errorCategory) attributes['error.category'] = errorCategory;

    this.calls.add(1, attributes);
    this.duration.record(durationMs / 1000, attributes);
  }
}
