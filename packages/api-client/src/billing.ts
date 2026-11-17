import { apiFetch } from './http';

export type PlanTier = 'FREE' | 'PRO';
export type BillingInterval = 'MONTHLY' | 'YEARLY';
/** `GROUP` = um assento que a comunidade paga (ADR 025). */
export type SubscriptionSource = 'ASAAS' | 'APPLE' | 'GOOGLE' | 'MANUAL' | 'INSTANCE' | 'GROUP';
export type SubscriptionStatus =
  'PENDING' | 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
/** Forma de pagamento da assinatura da web (Asaas). O Fatia não guarda cartão. */
export type PaymentMethod = 'PIX' | 'BOLETO' | 'CREDIT_CARD';
/** Estado da tela "Meu plano" (prancha Al-M13), espelho de `planState` da API. */
export type PlanState =
  'FREE' | 'TRIAL' | 'ACTIVE' | 'PENDING' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
/** Quem paga o PRO: a pessoa, um assento, a comunidade inteira ou um programa. */
export type PlanPayer = 'PERSONAL' | 'SEAT' | 'COMMUNITY' | 'PROGRAM';
/** Espelha `MotivoDoDireito` da API (`billing/ai-entitlement.ts`). */
export type PlanReason =
  | 'ativa'
  | 'carencia'
  | 'sem_assinatura'
  | 'inadimplente'
  | 'cancelada'
  | 'instancia'
  | 'pendente'
  | 'expirada'
  | 'teste'
  | 'teste_acabou';

/** `GET /billing/plan`: o plano como a tela "Meu plano" mostra (ADR 024). */
export interface MyPlan {
  tier: PlanTier;
  source: SubscriptionSource | null;
  reason: PlanReason;
  degraded: boolean;
  state: PlanState;
  status: SubscriptionStatus | null;
  interval: BillingInterval | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  /** Fim do teste grátis, enquanto `state` é `TRIAL`. */
  trialEndsAt: string | null;
  /** Pode começar o teste grátis (uma vez por pessoa). */
  trialEligible: boolean;
  /** Dias do teste grátis nesta instância; 0 = sem teste. */
  trialDays: number;
  paymentMethod: PaymentMethod | null;
  /**
   * Página da cobrança em aberto no Asaas. **Só a web mostra**: o app nunca
   * leva a pagamento fora da loja (`planStatusView`).
   */
  paymentUrl: string | null;
  /** Onde gerenciar quando a assinatura é da loja. */
  manageUrl: string | null;
  /** A comunidade que paga, quando o PRO é um assento (`source: 'GROUP'`). */
  groupName: string | null;
  paidBy: PlanPayer | null;
  /** Nome do programa, quando `paidBy` é `PROGRAM`. */
  programName: string | null;
  /** A instância exige plano para a IA? Sem exigência, não há o que vender. */
  requiresPlan: boolean;
  /** Assinatura pela web (Asaas) disponível nesta instância. */
  webCheckout: boolean;
  prices: { monthlyCents: number; yearlyCents: number };
}

export const billingApi = {
  plan: () => apiFetch<MyPlan>('/api/billing/plan'),
  /** Abre (ou reabre) o checkout do Asaas; o link vem em `paymentUrl`. */
  checkout: (input: { interval: BillingInterval; cpf: string; paymentMethod?: PaymentMethod }) =>
    apiFetch<MyPlan>('/api/billing/checkout', { method: 'POST', body: JSON.stringify(input) }),
  cancel: () => apiFetch<MyPlan>('/api/billing/cancel', { method: 'POST' }),
  /** Depois de comprar na loja: confirma na hora, sem esperar o webhook. */
  revenueCatSync: () => apiFetch<MyPlan>('/api/billing/revenuecat/sync', { method: 'POST' }),
};

/**
 * Bloco PRO (prancha Componentes-plano 1.2): o plano da pessoa vira um de 9
 * estados, e as telas (chat, foto, ditado, Meu plano, comunidade) só desenham.
 * Puro, para o PWA e o app mostrarem o mesmo estado.
 */
export type ProBlockState =
  | { kind: 'free'; trialDays: number }
  | { kind: 'trial'; day: number; totalDays: number; daysLeft: number }
  | { kind: 'pro'; interval: BillingInterval | null; renewsAt: string | null }
  | { kind: 'pro-community'; groupName: string | null }
  | { kind: 'pro-until'; until: string; daysLeft: number }
  | { kind: 'lite-ending'; remaining: number; limit: number }
  | { kind: 'free-no-purchase' }
  | { kind: 'pending-grace'; aiUntil: string | null; graceDaysLeft: number }
  | { kind: 'pro-expired' };

export interface ProBlockContext {
  now: Date;
  /**
   * Dá para comprar aqui? `false` no iOS sem compra no app: o bloco oferece
   * liberar pela comunidade ou "Tenho um código", nunca um preço.
   */
  canPurchase: boolean;
  /** Cota da IA Lite do dia (derivada de AiUsage). */
  lite?: { used: number; limit: number };
}

const TRIAL_DAYS = 7;
const DAY_MS = 86_400_000;
/** Lite "acabando" quando sobra até 20% da cota. */
const LITE_ENDING_SHARE = 0.2;

function daysUntil(iso: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY_MS));
}

export function proBlockState(plan: MyPlan, ctx: ProBlockContext): ProBlockState | null {
  // Instância sem exigência de plano: não há o que vender nem o que avisar.
  if (!plan.requiresPlan) return null;

  if (plan.reason === 'carencia' || (plan.status === 'PAST_DUE' && plan.graceEndsAt)) {
    return {
      kind: 'pending-grace',
      aiUntil: plan.graceEndsAt,
      graceDaysLeft: plan.graceEndsAt ? daysUntil(plan.graceEndsAt, ctx.now) : 0,
    };
  }

  if (plan.tier === 'PRO') {
    if (plan.source === 'GROUP') return { kind: 'pro-community', groupName: plan.groupName };
    if (plan.state === 'TRIAL' && plan.trialEndsAt) {
      const daysLeft = daysUntil(plan.trialEndsAt, ctx.now);
      const totalDays = plan.trialDays || TRIAL_DAYS;
      // "4 de 7 · 3 dias restantes": o dia corrente é o total menos o que falta.
      const day = Math.max(1, totalDays - daysLeft);
      return { kind: 'trial', day, totalDays, daysLeft };
    }
    if (plan.source === 'MANUAL' && plan.cancelAtPeriodEnd && plan.currentPeriodEnd) {
      return {
        kind: 'pro-until',
        until: plan.currentPeriodEnd,
        daysLeft: daysUntil(plan.currentPeriodEnd, ctx.now),
      };
    }
    return { kind: 'pro', interval: plan.interval, renewsAt: plan.currentPeriodEnd };
  }

  if (plan.reason === 'expirada' || plan.reason === 'inadimplente' || plan.reason === 'cancelada') {
    return { kind: 'pro-expired' };
  }
  if (ctx.lite && ctx.lite.limit > 0) {
    const remaining = Math.max(0, ctx.lite.limit - ctx.lite.used);
    if (remaining <= ctx.lite.limit * LITE_ENDING_SHARE) {
      return { kind: 'lite-ending', remaining, limit: ctx.lite.limit };
    }
  }
  if (!ctx.canPurchase) return { kind: 'free-no-purchase' };
  return { kind: 'free', trialDays: plan.trialEligible ? plan.trialDays : 0 };
}
