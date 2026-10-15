/**
 * A porta do provedor de pagamento (#158).
 *
 * Existe para que **um arquivo** conheça o Asaas. Nome de endpoint, header de
 * autenticação, formato de data e vocabulário de status são detalhe de um
 * fornecedor que pode mudar; a fatura, a pró-rata e a contagem de cabeças não.
 * Sem a porta, esse vocabulário vazaria para o job de fechamento e para os
 * testes, e trocar de provedor viraria reescrita.
 *
 * O segundo motivo é testável: **nenhum teste toca a rede.** Quem exercita o
 * adapter é `__tests__/asaas.provider.spec.ts`, trocando o `fetch` global.
 *
 * Não há dublê genérico desta porta, e é deliberado: `verifyWebhook` recebe o
 * corpo **cru** do provedor, no vocabulário dele. Um fake que aceitasse o
 * vocabulário da Fatia não seria substituto do adapter em teste nenhum — passaria
 * verde justamente sobre a tradução, que é o que o adapter existe para fazer. O
 * dublê útil só nasce junto com o handler de webhook, e falando Asaas.
 */

/**
 * Status da cobrança no vocabulário da Fatia.
 *
 * `UNKNOWN` existe de propósito: o Asaas tem catorze status e ganha status novo
 * sem avisar. Traduzir um desconhecido para `PENDING` seria inventar; explodir
 * devolveria 500 para um webhook que o provedor então reentregaria em laço.
 * `UNKNOWN` é registrado e não processado.
 */
export type StatusDaCobranca = 'PENDING' | 'PAID' | 'OVERDUE' | 'VOID' | 'UNKNOWN';

export interface EntradaDeCliente {
  /** Vira `externalReference` no provedor: é o que reconcilia sem busca por nome. */
  groupId: string;
  name: string;
  /** CPF ou CNPJ da academia. Da **academia**, nunca de aluno. */
  taxId: string;
  email: string;
}

export interface EntradaDeCobranca {
  providerCustomerId: string;
  amountCents: number;
  dueAt: Date;
  /**
   * O que a academia lê no boleto. Período e contagem — nunca nome de aluno:
   * a descrição viaja por e-mail, SMS e app do banco.
   */
  description: string;
  /** O id da nossa fatura. É o que liga cobrança e fatura sem depender de ordem. */
  externalReference: string;
}

export type ResultadoDeWebhook =
  | { ok: false; motivo: 'token_invalido' | 'payload_invalido' }
  | {
      ok: true;
      /** Id do evento no provedor. É a chave de idempotência da reentrega. */
      eventId: string;
      chargeId: string;
      status: StatusDaCobranca;
      /** O evento cru, para a trilha. Diagnóstico não se reconstrói depois. */
      event: string;
    };

export interface BillingProvider {
  ensureCustomer(entrada: EntradaDeCliente): Promise<{ providerCustomerId: string }>;
  createCharge(entrada: EntradaDeCobranca): Promise<{ providerChargeId: string; url?: string }>;
  getCharge(providerChargeId: string): Promise<{ status: StatusDaCobranca; paidAt?: Date }>;
  /**
   * Confere o segredo do webhook e traduz o corpo.
   *
   * Síncrono e sem banco: a decisão de aceitar ou não é anterior a qualquer
   * escrita. O `rawBody` é o corpo **cru**, não o objeto já parseado — quem
   * autentica precisa ver os mesmos bytes que chegaram.
   */
  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): ResultadoDeWebhook;
}

// ─── Assinatura PRO da pessoa (ADR 024) ──────────────────────────────────────

export interface EntradaDeClientePessoa {
  /** Vira `externalReference` (`user:<id>`) no provedor. */
  userId: string;
  name: string;
  email: string;
  /**
   * CPF, só dígitos. O Asaas exige para emitir cobrança; o Fatia não guarda —
   * passa adiante uma vez e fica só com o id do cliente.
   */
  cpf: string;
}

export interface EntradaDeAssinatura {
  providerCustomerId: string;
  valueCents: number;
  cycle: 'MONTHLY' | 'YEARLY';
  /** Vencimento da primeira cobrança. */
  nextDueAt: Date;
  description: string;
  externalReference: string;
}

export type ResultadoDeWebhookDeAssinatura =
  | { ok: false; motivo: 'token_invalido' | 'payload_invalido' }
  | {
      ok: true;
      eventId: string;
      event: string;
      /** Assinatura a que o evento se refere; `null` = cobrança avulsa (B2B). */
      subscriptionId: string | null;
      status: StatusDaCobranca;
      /** Vencimento da cobrança do evento, `YYYY-MM-DD`, no fuso do provedor. */
      dueDate: string | null;
    };

/**
 * O lado de assinatura recorrente do provedor. Separado de `BillingProvider`
 * (cobrança avulsa do grupo) porque os consumidores são outros e o B2B não
 * precisa saber de assinatura de pessoa.
 */
export interface SubscriptionProvider {
  ensurePersonCustomer(entrada: EntradaDeClientePessoa): Promise<{ providerCustomerId: string }>;
  createSubscription(entrada: EntradaDeAssinatura): Promise<{ providerSubscriptionId: string }>;
  /** Página de pagamento da primeira cobrança (Pix, boleto ou cartão). */
  firstPaymentUrl(providerSubscriptionId: string): Promise<string | null>;
  /** Encerra a recorrência. Cobranças já pagas não são estornadas. */
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  verifySubscriptionWebhook(
    headers: Record<string, string | undefined>,
    rawBody: string,
  ): ResultadoDeWebhookDeAssinatura;
}
