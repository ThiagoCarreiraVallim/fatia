import type { BillingInterval, SubscriptionSource, SubscriptionStatus } from '@prisma/client';

/**
 * O vocabulário da RevenueCat (compra dentro do app, ADR 024). **Só este
 * arquivo e `revenuecat.service.ts` o conhecem.**
 *
 * A fonte da verdade é o assinante na REST (`GET /v1/subscribers/:id`), e não
 * o corpo do webhook: o webhook só avisa que algo mudou. Assim evento fora de
 * ordem, perdido ou repetido não deixa estado errado — a leitura seguinte
 * corrige.
 */

export interface RcEntitlement {
  expires_date: string | null;
  grace_period_expires_date?: string | null;
  product_identifier: string;
  purchase_date?: string;
}

export interface RcSubscription {
  expires_date: string | null;
  store: string;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  grace_period_expires_date?: string | null;
  refunded_at?: string | null;
  period_type?: string;
}

export interface RcSubscriber {
  entitlements?: Record<string, RcEntitlement>;
  subscriptions?: Record<string, RcSubscription>;
}

export interface RcWebhook {
  api_version?: string;
  event?: {
    id?: string;
    type?: string;
    app_user_id?: string;
    original_app_user_id?: string;
    aliases?: string[];
  };
}

/** A linha de `UserSubscription` que o assinante descreve agora. */
export interface AssinaturaDaLoja {
  source: Extract<SubscriptionSource, 'APPLE' | 'GOOGLE'>;
  providerRef: string;
  productId: string;
  interval: BillingInterval;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
}

const LOJAS: Record<string, AssinaturaDaLoja['source']> = {
  app_store: 'APPLE',
  mac_app_store: 'APPLE',
  play_store: 'GOOGLE',
};

const data = (iso: string | null | undefined): Date | null => (iso ? new Date(iso) : null);

/** Mensal ou anual pelo id do produto (`fatia_pro_mensal`, `fatia_pro_anual`). */
export function intervaloDoProduto(produto: string): BillingInterval {
  return /(anual|annual|yearly|year|\.y$|_y$|p1y)/i.test(produto) ? 'YEARLY' : 'MONTHLY';
}

/**
 * Assinante → assinatura. `null` quando o entitlement não existe ou não veio
 * de uma loja (cupom promocional da RevenueCat, por exemplo, fica de fora: o
 * PRO de cortesia do Fatia é o `MANUAL`).
 */
export function assinaturaDoAssinante(
  assinante: RcSubscriber,
  userId: string,
  entitlementId: string,
  agora: Date = new Date(),
): AssinaturaDaLoja | null {
  const ent = assinante.entitlements?.[entitlementId];
  if (!ent) return null;
  const produto = ent.product_identifier;
  const sub = assinante.subscriptions?.[produto];
  const source = sub ? LOJAS[sub.store] : undefined;
  if (!sub || !source) return null;

  const fim = data(ent.expires_date ?? sub.expires_date);
  const carencia = data(ent.grace_period_expires_date ?? sub.grace_period_expires_date);
  let status: SubscriptionStatus;
  if (sub.refunded_at) status = 'EXPIRED';
  else if (!fim || fim > agora) status = 'ACTIVE';
  else if ((carencia && carencia > agora) || sub.billing_issues_detected_at) status = 'PAST_DUE';
  else status = 'EXPIRED';

  return {
    source,
    providerRef: `${userId}:${produto}`,
    productId: produto,
    interval: intervaloDoProduto(produto),
    status,
    currentPeriodEnd: fim,
    graceEndsAt: status === 'PAST_DUE' ? carencia : null,
    cancelAtPeriodEnd: Boolean(sub.unsubscribe_detected_at),
  };
}
