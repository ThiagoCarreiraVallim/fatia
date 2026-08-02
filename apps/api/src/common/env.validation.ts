import { z } from 'zod';

export const AppEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  // Logto (ADR 008) — provider OIDC. A API valida JWTs do Logto.
  LOGTO_ENDPOINT: z.string().url(),
  LOGTO_AUDIENCE: z.string().min(1),
  // OAuth facade pro MCP — app dedicado no Logto (tipo Traditional Web).
  LOGTO_MCP_APP_ID: z.string().min(1),
  LOGTO_MCP_APP_SECRET: z.string().min(1),
  WEB_ORIGIN: z.string().url().default('http://localhost:3030'),
  // Observabilidade (issue #39). Vazio = instrumentação inerte: sem exportador, sem timer, sem
  // container extra. Quem sobe o stack do `infra/docker-compose.observability.yml` preenche.
  // Declarado aqui só para validar e documentar — o `tracing.ts` lê `process.env` direto,
  // porque roda antes do Nest existir.
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional().or(z.literal('')),
  OTEL_SERVICE_NAME: z.string().min(1).default('fatia-api'),
});

export type AppEnv = z.infer<typeof AppEnvSchema>;
