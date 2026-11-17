import type { BillingInterval, SubscriptionStatus, UserSubscription } from '@prisma/client';
import { addDaysIso, dayBoundsInTz } from '../progress/helpers/date-tz';
import { CARENCIA_DIAS } from './ai-entitlement';

/**
 * A regra dos eventos do Asaas, pura: serve à assinatura da pessoa
 * (`UserSubscription`, ADR 024) e aos assentos da comunidade
 * (`GroupSeatPool`, ADR 025), que reagem do mesmo jeito a pagamento, atraso,
 * estorno e cancelamento.
 */

const FUSO_DO_PROVEDOR = 'America/Sao_Paulo';

/** Fim do período pago por uma cobrança que vence em `dueDate`. */
export function fimDoPeriodo(dueDate: string, interval: BillingInterval | null): Date {
  const [a, m, d] = dueDate.split('-').map(Number);
  const meses = interval === 'YEARLY' ? 12 : 1;
  const alvoMes = m - 1 + meses;
  const ano = a + Math.floor(alvoMes / 12);
  const mes = alvoMes % 12;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const ymd = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
  return dayBoundsInTz(ymd, FUSO_DO_PROVEDOR).start;
}

/**
 * O que um evento muda. Campos comuns a `UserSubscription` e `GroupSeatPool`,
 * para a mesma regra servir à assinatura da pessoa e aos assentos (ADR 025).
 */
export interface MudancaDeAssinatura {
  status?: SubscriptionStatus;
  graceEndsAt?: Date | null;
  /** O link da cobrança em aberto (só `https`), ou `null` quando ela foi paga. */
  paymentUrl?: string | null;
  currentPeriodEnd?: Date;
  canceledAt?: Date;
  cancelAtPeriodEnd?: boolean;
}

/**
 * O que um evento muda na assinatura. `null` = nada (evento velho ou irrelevante).
 *
 * `invoiceUrl` é a página da cobrança do evento: a da renovação criada ou
 * vencida vira o "Abrir página de pagamento" da web (#386). Quem não passa
 * (os assentos) não guarda link de renovação.
 */
export function subscriptionEventChange(
  sub: Pick<UserSubscription, 'status' | 'interval' | 'currentPeriodEnd'>,
  evento: string,
  dueDate: string | null,
  invoiceUrl?: string | null,
): MudancaDeAssinatura | null {
  const encerrada = sub.status === 'CANCELED' || sub.status === 'EXPIRED';
  const link = invoiceUrl && /^https:\/\//.test(invoiceUrl) ? invoiceUrl : null;
  // A cobrança é de um período que já está pago (reentrega, fora de ordem).
  const jaPaga = (due: string) =>
    sub.currentPeriodEnd !== null && fimDoPeriodo(due, sub.interval) <= sub.currentPeriodEnd;
  switch (evento) {
    case 'PAYMENT_CREATED': {
      if (!link || !dueDate || encerrada || jaPaga(dueDate)) return null;
      return { paymentUrl: link };
    }
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED': {
      if (!dueDate) return null;
      const fim = fimDoPeriodo(dueDate, sub.interval);
      if (sub.currentPeriodEnd && fim <= sub.currentPeriodEnd && sub.status === 'ACTIVE') {
        return null; // confirmação repetida ou fora de ordem
      }
      return {
        status: 'ACTIVE',
        graceEndsAt: null,
        paymentUrl: null,
        currentPeriodEnd:
          sub.currentPeriodEnd && sub.currentPeriodEnd > fim ? sub.currentPeriodEnd : fim,
      };
    }
    case 'PAYMENT_OVERDUE': {
      // O primeiro pagamento nunca feito não é atraso: o checkout só não foi
      // pago, ou o teste acabou sem pagamento (carência é de quem já pagou).
      if (!dueDate || sub.status === 'PENDING' || sub.status === 'TRIALING' || encerrada) {
        return null;
      }
      if (jaPaga(dueDate)) return null; // atraso de uma cobrança que já foi superada
      return {
        status: 'PAST_DUE',
        graceEndsAt: dayBoundsInTz(addDaysIso(dueDate, CARENCIA_DIAS), FUSO_DO_PROVEDOR).start,
        ...(link ? { paymentUrl: link } : {}),
      };
    }
    case 'PAYMENT_REFUNDED':
    case 'PAYMENT_CHARGEBACK_REQUESTED':
      return { status: 'EXPIRED', canceledAt: new Date(), cancelAtPeriodEnd: false };
    case 'SUBSCRIPTION_DELETED':
    case 'SUBSCRIPTION_INACTIVATED':
      if (sub.status === 'PENDING') {
        return { status: 'CANCELED', canceledAt: new Date(), paymentUrl: null };
      }
      if (encerrada) return null;
      // O período pago continua valendo; só a renovação acabou.
      return { cancelAtPeriodEnd: true, canceledAt: new Date() };
    default:
      return null;
  }
}
