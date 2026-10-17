import { apiFetch } from './http';

export type PlanTier = 'FREE' | 'PRO';
export type BillingInterval = 'MONTHLY' | 'YEARLY';
/** `GROUP` = um assento que a comunidade paga (ADR 025). */
export type SubscriptionSource = 'ASAAS' | 'APPLE' | 'GOOGLE' | 'MANUAL' | 'INSTANCE' | 'GROUP';
export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
/** Espelha `MotivoDoDireito` da API (`billing/ai-entitlement.ts`). */
export type PlanReason =
  | 'ativa'
  | 'carencia'
  | 'sem_assinatura'
  | 'inadimplente'
  | 'cancelada'
  | 'instancia'
  | 'pendente'
  | 'expirada';

/** `GET /billing/plan`: o plano como a tela "Meu plano" mostra (ADR 024). */
export interface MyPlan {
  tier: PlanTier;
  source: SubscriptionSource | null;
  reason: PlanReason;
  degraded: boolean;
  status: SubscriptionStatus | null;
  interval: BillingInterval | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  /** Link do checkout aberto (Asaas), enquanto pendente. */
  paymentUrl: string | null;
  /** Onde gerenciar quando a assinatura é da loja. */
  manageUrl: string | null;
  /** A comunidade que paga, quando o PRO é um assento (`source: 'GROUP'`). */
  groupName: string | null;
  /** A instância exige plano para a IA? Sem exigência, não há o que vender. */
  requiresPlan: boolean;
  /** Assinatura pela web (Asaas) disponível nesta instância. */
  webCheckout: boolean;
  prices: { monthlyCents: number; yearlyCents: number };
}

export const billingApi = {
  plan: () => apiFetch<MyPlan>('/api/billing/plan'),
  /** Abre (ou reabre) o checkout do Asaas; o link vem em `paymentUrl`. */
  checkout: (input: { interval: BillingInterval; cpf: string }) =>
    apiFetch<MyPlan>('/api/billing/checkout', { method: 'POST', body: JSON.stringify(input) }),
  cancel: () => apiFetch<MyPlan>('/api/billing/cancel', { method: 'POST' }),
  /** Depois de comprar na loja: confirma na hora, sem esperar o webhook. */
  revenueCatSync: () => apiFetch<MyPlan>('/api/billing/revenuecat/sync', { method: 'POST' }),
};
