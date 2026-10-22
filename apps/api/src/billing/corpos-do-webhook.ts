import type { INestApplication } from '@nestjs/common';
import { text } from 'express';

/** Webhook de pagamento é pequeno; o teto só barra abuso. */
const TETO_DO_WEBHOOK = 256 * 1024;

/**
 * Corpo **cru** nos webhooks de cobrança.
 *
 * Quem autentica o webhook confere o corpo como chegou; o parser de JSON global
 * entregaria um objeto já reinterpretado. Como em `corpos-do-chat.ts`, o parser
 * vale **só** para estas rotas e tem de ser registrado em `main.ts` antes do
 * global.
 */
export function registrarCorposDoWebhook(app: INestApplication): void {
  app.use('/api/billing/webhooks', text({ type: () => true, limit: TETO_DO_WEBHOOK }));
}
