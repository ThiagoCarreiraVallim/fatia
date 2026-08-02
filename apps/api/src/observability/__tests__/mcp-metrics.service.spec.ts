import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type MetricData,
} from '@opentelemetry/sdk-metrics';
import { ALLOWED_MCP_METRIC_ATTRIBUTES, McpMetricsService } from '../mcp-metrics.service';

/**
 * Guarda de cardinalidade e de PII.
 *
 * O modo de falha que este teste existe para pegar é alguém acrescentar `userId` (ou o nome do
 * alimento) num rótulo "só para depurar". Em runtime isso **não dá erro nenhum**: o Prometheus
 * aceita, cria uma série por valor e o container morre de memória semanas depois, longe da
 * causa. Só um teste pega.
 */
describe('McpMetricsService', () => {
  let exporter: InMemoryMetricExporter;
  let reader: PeriodicExportingMetricReader;
  let provider: MeterProvider;

  beforeEach(() => {
    exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    // Intervalo alto: o disparo é sempre manual, via `forceFlush`.
    reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 600_000 });
    provider = new MeterProvider({ readers: [reader] });
    metrics.disable();
    metrics.setGlobalMeterProvider(provider);
  });

  afterEach(async () => {
    await provider.shutdown();
    metrics.disable();
  });

  async function coletar(): Promise<MetricData[]> {
    await reader.forceFlush();
    return exporter
      .getMetrics()
      .flatMap((rm) => rm.scopeMetrics)
      .flatMap((sm) => sm.metrics);
  }

  it('registra contagem e duração por tool e resultado', async () => {
    const service = new McpMetricsService();
    service.record({ tool: 'log_meal', durationMs: 120, success: true });
    service.record({ tool: 'log_meal', durationMs: 80, success: true });
    service.record({
      tool: 'search_food',
      durationMs: 300,
      success: false,
      errorCategory: 'NOT_FOUND',
    });

    const metricas = await coletar();
    const nomes = metricas.map((m) => m.descriptor.name).sort();
    expect(nomes).toEqual(['mcp.tool.calls', 'mcp.tool.duration']);

    const calls = metricas.find((m) => m.descriptor.name === 'mcp.tool.calls');
    const sucesso = calls?.dataPoints.find(
      (p) => p.attributes.tool === 'log_meal' && p.attributes.success === 'true',
    );
    expect(sucesso?.value).toBe(2);

    const falha = calls?.dataPoints.find((p) => p.attributes.tool === 'search_food');
    expect(falha?.attributes).toEqual({
      tool: 'search_food',
      success: 'false',
      'error.category': 'NOT_FOUND',
    });
  });

  it('nenhum rótulo fora da lista permitida — nem userId, nem e-mail, nem UUID', async () => {
    const service = new McpMetricsService();
    // Um contexto realista de chamada: se algum dia o `record()` passar a receber e propagar o
    // usuário, é aqui que aparece.
    service.record({ tool: 'log_meal', durationMs: 42, success: true });
    service.record({
      tool: 'delete_meal',
      durationMs: 7,
      success: false,
      errorCategory: 'INTERNAL',
    });

    const metricas = await coletar();
    expect(metricas.length).toBeGreaterThan(0);

    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const email = /[\w.+-]+@[\w-]+\.[\w.-]+/;

    for (const metrica of metricas) {
      for (const ponto of metrica.dataPoints) {
        for (const [chave, valor] of Object.entries(ponto.attributes)) {
          expect(ALLOWED_MCP_METRIC_ATTRIBUTES).toContain(chave);
          expect(String(valor)).not.toMatch(uuid);
          expect(String(valor)).not.toMatch(email);
        }
      }
    }
  });
});
