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
});

export type AppEnv = z.infer<typeof AppEnvSchema>;
