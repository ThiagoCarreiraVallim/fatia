import type { OfferPurchaseStatus, Prisma } from '@prisma/client';

/**
 * Evento do Asaas na cobrança de uma compra de oferta (#403). Idempotente:
 * o mesmo estado de novo é `sem_efeito`, e pago só sai de pago por estorno
 * (evento de vencida fora de ordem não desfaz pagamento).
 */
export async function applyToOfferPurchase(
  tx: Prisma.TransactionClient,
  compra: { id: string; status: OfferPurchaseStatus },
  event: string,
  now: Date = new Date(),
): Promise<null | 'sem_efeito'> {
  let data: Prisma.GroupOfferPurchaseUpdateInput | null = null;
  switch (event) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED':
      if (compra.status === 'PAID' || compra.status === 'REFUNDED') break;
      data = { status: 'PAID', paidAt: now };
      break;
    case 'PAYMENT_OVERDUE':
    case 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED':
      if (compra.status !== 'PENDING') break;
      data = { status: 'FAILED', failedAt: now };
      break;
    case 'PAYMENT_REFUNDED':
    case 'PAYMENT_CHARGEBACK_REQUESTED':
      if (compra.status === 'REFUNDED') break;
      data = { status: 'REFUNDED' };
      break;
    default:
      break;
  }
  if (!data) return 'sem_efeito';
  await tx.groupOfferPurchase.update({ where: { id: compra.id }, data });
  return null;
}
