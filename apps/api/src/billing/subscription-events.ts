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
  paymentUrl?: null;
  currentPeriodEnd?: Date;
  canceledAt?: Date;
  cancelAtPeriodEnd?: boolean;
}

/** O que um evento muda na assinatura. `null` = nada (evento velho ou irrelevante). */
export function mudancaDoEvento(
  sub: Pick<UserSubscription, 'status' | 'interval' | 'currentPeriodEnd'>,
  evento: string,
  dueDate: string | null,
): MudancaDeAssinatura | null {
  const encerrada = sub.status === 'CANCELED' || sub.status === 'EXPIRED';
  switch (evento) {
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
      // O primeiro pagamento nunca feito não é atraso: o checkout só não foi pago.
      if (!dueDate || sub.status === 'PENDING' || encerrada) return null;
      if (sub.currentPeriodEnd && fimDoPeriodo(dueDate, sub.interval) <= sub.currentPeriodEnd) {
        return null; // atraso de uma cobrança que já foi superada
      }
      return {
        status: 'PAST_DUE',
        graceEndsAt: dayBoundsInTz(addDaysIso(dueDate, CARENCIA_DIAS), FUSO_DO_PROVEDOR).start,
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
