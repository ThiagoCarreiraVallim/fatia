import type { StatusDaCobranca } from '../billing-provider.port';

/**
 * O vocabulário do Asaas. **Só este arquivo e o `asaas.provider.ts` o conhecem.**
 *
 * Conferido contra a API de sandbox e a documentação vigente em 03/08/2026
 * (`https://docs.asaas.com`). O que foi exercitado de fato, e o que não foi,
 * está escrito em `docs/BILLING.md` — nada aqui é resultado de integração
 * presumido.
 */

/** Envelope de erro do Asaas, confirmado contra o sandbox (HTTP 401). */
export interface AsaasErro {
  errors?: Array<{ code?: string; description?: string }>;
}

export interface AsaasCliente {
  id: string;
  name?: string;
  externalReference?: string;
}

/** Formas de pagamento aceitas na criação da cobrança. */
export type AsaasBillingType = 'UNDEFINED' | 'BOLETO' | 'CREDIT_CARD' | 'PIX';

export interface AsaasCobranca {
  id: string;
  status?: string;
  value?: number;
  dueDate?: string;
  externalReference?: string;
  /** Página de pagamento. É o link que o dono da academia abre. */
  invoiceUrl?: string;
  /** Data de crédito efetivo, `YYYY-MM-DD`. */
  paymentDate?: string;
  confirmedDate?: string;
}

export interface AsaasEventoDeWebhook {
  id?: string;
  event?: string;
  payment?: AsaasCobranca;
}

/**
 * Tradução dos status do Asaas para o vocabulário da Fatia.
 *
 * Mapa explícito, não heurística de prefixo: `CHARGEBACK_REQUESTED` e
 * `RECEIVED_IN_CASH` significam coisas opostas e um `startsWith` acertaria os
 * dois pelo motivo errado. O que não estiver aqui é `UNKNOWN` — e `UNKNOWN` é
 * registrado sem processar, nunca convertido em "pago".
 */
const TRADUCAO: Readonly<Record<string, StatusDaCobranca>> = {
  PENDING: 'PENDING',
  AWAITING_RISK_ANALYSIS: 'PENDING',
  APPROVED_BY_RISK_ANALYSIS: 'PENDING',
  AWAITING_CHARGEBACK_REVERSAL: 'PENDING',
  // `CONFIRMED` é dinheiro reconhecido e ainda não creditado; `RECEIVED`, creditado.
  // Os dois quitam a fatura: a academia pagou. O extrato é outro problema.
  CONFIRMED: 'PAID',
  RECEIVED: 'PAID',
  RECEIVED_IN_CASH: 'PAID',
  OVERDUE: 'OVERDUE',
  DUNNING_REQUESTED: 'OVERDUE',
  DUNNING_RECEIVED: 'OVERDUE',
  REPROVED_BY_RISK_ANALYSIS: 'VOID',
  REFUNDED: 'VOID',
  REFUND_REQUESTED: 'VOID',
  REFUND_IN_PROGRESS: 'VOID',
  CHARGEBACK_REQUESTED: 'VOID',
  CHARGEBACK_DISPUTE: 'VOID',
};

export function traduzStatus(bruto: string | undefined): StatusDaCobranca {
  if (!bruto) return 'UNKNOWN';
  return TRADUCAO[bruto] ?? 'UNKNOWN';
}
