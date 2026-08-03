import { z } from 'zod';
import { parseAiPriceTable } from '../ai/ai-pricing';

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

  // IA hospedada (issue #135). Tudo opcional e inerte por default: a instância que não usa IA —
  // que é como o produto funciona hoje — não precisa preencher nada, e o caminho manual não
  // depende de nenhuma destas.
  //
  // Preço por **configuração**, não por deploy: o AI Gateway troca de modelo sem subir código, e a
  // tabela de preço tem de poder acompanhar pela mesma via, senão o custo passa a ser medido com o
  // preço do modelo antigo.
  AI_PRICE_TABLE: z
    .string()
    .default('')
    // `transform` e não `refine`: validar sem converter deixaria o `JSON.parse` para o primeiro uso
    // — ou seja, para o meio de uma requisição de usuário em produção. Aqui o boot falha.
    .transform((raw, ctx) => {
      try {
        return parseAiPriceTable(raw);
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : String(err),
        });
        return z.NEVER;
      }
    }),

  // Tetos diários em micro-unidades da moeda, na janela UTC de `ai-quota.ts`. `0` = sem cota, que é
  // o correto para instância auto-hospedada com modelo local: não há custo a conter.
  AI_QUOTA_DAILY_MICROS: z.coerce.number().int().nonnegative().default(0),
  AI_QUOTA_GLOBAL_DAILY_MICROS: z.coerce.number().int().nonnegative().default(0),
});

export type AppEnv = z.infer<typeof AppEnvSchema>;
