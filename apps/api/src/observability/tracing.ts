import { hostname } from 'node:os';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { defaultResource, envDetector, resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_URL_PATH,
} from '@opentelemetry/semantic-conventions';
import { RedactingSpanProcessor } from './redacting-span-processor';

/**
 * Bootstrap do OpenTelemetry. **Precisa rodar antes de qualquer coisa do Nest** — a
 * instrumentação automática funciona trocando o `module.exports` de `http`, `express` e
 * `@nestjs/core` no momento do `require`. Se o Nest carregar primeiro, o patch chega tarde e
 * não sai span nenhum. Por isso este arquivo é o **primeiro import** do `main.ts` e é executado
 * por efeito colateral de import, não por chamada.
 *
 * Decisão central: **instrumentar sempre, exportar por configuração.** Sem
 * `OTEL_EXPORTER_OTLP_ENDPOINT` nada é registrado — nem patch, nem exportador, nem timer. Quem
 * roda o Fatia auto-hospedado não é obrigado a subir cinco containers de observabilidade para o
 * app funcionar, e o `pnpm dev` do dia a dia continua sem overhead.
 */

/**
 * `userId` **não entra em span nem em métrica.** Decisão consciente, registrada também em
 * `docs/THREAT_MODEL.md`.
 *
 * O argumento não é que rastrear pessoa seja inútil — é que o custo não se paga aqui:
 *
 * 1. **O log já tem.** O `mcp-tool.registry.ts` grava `userId` por chamada, e a correlação
 *    log↔trace é justamente o que esta issue entrega. Do trace se chega ao log pelo `trace_id`,
 *    e o log responde "quem". Duplicar a identidade no Tempo não acrescenta resposta nenhuma.
 * 2. **Cardinalidade.** Em métrica, um label por usuário faz o Prometheus crescer sem erro
 *    algum, até o container morrer semanas depois, longe da causa.
 * 3. **Superfície.** O Tempo não tem o mesmo tratamento de retenção e de eliminação que o
 *    `docs/DATA_RETENTION.md` define para o banco. Dado de saúde vinculado a pessoa num store
 *    sem essa disciplina é passivo, não ferramenta.
 *
 * Hash também foi considerado e descartado: um hash estável de `userId` continua sendo um
 * identificador pessoal pseudonimizado (LGPD art. 13) e reintroduz o problema 2 inteiro.
 */

/**
 * Este arquivo roda antes do `ConfigModule`, que é quem normalmente lê o `.env`. Sem isto,
 * `OTEL_EXPORTER_OTLP_ENDPOINT` escrita no `.env` seria simplesmente ignorada e a pessoa passaria
 * a tarde procurando por que o Grafana está vazio. Mesma lista de arquivos do `app.module.ts`.
 *
 * `loadEnvFile` é nativo do Node (>= 20.12) — não introduz dependência — e **não** sobrescreve
 * variável já definida no ambiente, então o painel do Dokploy continua tendo precedência.
 */
for (const envFile of ['.env', '../../.env']) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    // Arquivo ausente é o caso normal em container: as variáveis vêm do ambiente.
  }
}

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();

if (endpoint) {
  if (process.env.OTEL_DIAG_LOG_LEVEL === 'debug') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || 'fatia-api';
  const base = endpoint.replace(/\/+$/, '');

  const sdk = new NodeSDK({
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.0',
        // Nome estável para o Grafana filtrar; `NODE_ENV` já é validado no boot do Nest.
        'deployment.environment.name': process.env.NODE_ENV ?? 'development',
        'host.name': hostname(),
      }),
    ),

    // Só o detector de ambiente. Os detectores default (`process`, `host`) acrescentam
    // `process.command_args`, `process.owner`, `process.executable.path` e afins — que o Loki
    // repete como structured metadata em **cada linha de log**. Medido: ~185 bytes por linha de
    // atributo que ninguém consulta, além de expor caminho absoluto e usuário do host num store
    // de log. `envDetector` fica porque é o que respeita `OTEL_RESOURCE_ATTRIBUTES`.
    resourceDetectors: [envDetector],

    // Único processador registrado: tudo passa pelo saneamento antes de sair do processo.
    spanProcessors: [
      new RedactingSpanProcessor(
        new BatchSpanProcessor(new OTLPTraceExporter({ url: `${base}/v1/traces` })),
      ),
    ],

    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics` }),
        // 15 s casa com o scrape do Prometheus sobre o collector. Mais rápido que isso só
        // aumenta volume sem melhorar resolução, porque o Prometheus não vai ler mais rápido.
        exportIntervalMillis: 15_000,
      }),
    ],

    logRecordProcessors: [
      new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${base}/v1/logs` }) }),
    ],

    instrumentations: [
      // Lista explícita em vez de `auto-instrumentations-node`: aquele pacote arrasta ~40
      // instrumentações (Redis, Kafka, AWS, GraphQL...) que este serviço não usa, e cada uma
      // é código carregado no boot e um vetor a mais de atributo sensível não previsto.
      new HttpInstrumentation({
        // O health check bate a cada poucos segundos e produziria a maior parte dos spans do
        // sistema, sem nunca ser o span que alguém abre para investigar.
        ignoreIncomingRequestHook: (request) => {
          const path = (request.url ?? '').split('?')[0];
          return path === '/health';
        },
        // Defesa em profundidade: o `RedactingSpanProcessor` já corta a query string, mas aqui
        // ela nem chega a ser lida. `headersToSpanAttributes` fica deliberadamente **não
        // configurado** — ligá-lo mandaria `Authorization` e `Cookie` para o Tempo.
        startIncomingSpanHook: (request) => ({
          [ATTR_URL_PATH]: (request.url ?? '').split('?')[0],
        }),
      }),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
      // Injeta `trace_id`/`span_id`/`trace_flags` em todo log do pino emitido dentro de um span,
      // e reenvia o mesmo registro por OTLP. É o que costura os três sinais: o `trace_id` do
      // log do Loki abre o trace no Tempo.
      new PinoInstrumentation(),
    ],
  });

  sdk.start();

  // Sem isto, o último lote de spans/métricas morre com o processo — e o trace do erro que
  // derrubou o container é exatamente o que se quer ver depois.
  const shutdown = (): void => {
    void sdk.shutdown().finally(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
