import { z } from 'zod';

export const AppEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  WEB_ORIGIN: z.string().url().default('http://localhost:3001'),
});

export type AppEnv = z.infer<typeof AppEnvSchema>;
