import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import type { ResultadoDeWebhookDeAssinatura } from '../billing-provider.port';
import { SeatPoolService } from '../seat-pool.service';

type Evento = Extract<ResultadoDeWebhookDeAssinatura, { ok: true }>;

/**
 * Webhook do Asaas nas compras de oferta (#403): a cobrança de uma compra
 * (`providerPaymentId`) vira paga, falha ou estorno. Idempotente: o mesmo
 * evento de novo não muda nada, e pagamento não volta a "falhou" por evento
 * fora de ordem.
 */
describe('webhook das compras de oferta (#403, banco real)', () => {
  const prisma = new PrismaService();
  const config = { get: (_k: string, padrao?: unknown) => padrao } as unknown as ConfigService;
  const seats = new SeatPoolService(prisma, config, null);
  const stamp = `compra-wh-${Date.now()}`;
  let g = '';
  let dona = '';
  let offerId = '';

  const evento = (paymentId: string, event: string, status: Evento['status']): Evento => ({
    ok: true,
    eventId: `${paymentId}-${event}-${Math.random()}`,
    event,
    subscriptionId: null,
    status,
    dueDate: '2026-11-20',
    paymentId,
    externalReference: null,
    valueCents: 14_900,
    invoiceUrl: 'https://sandbox.asaas.com/i/x',
  });
  const aplicar = (r: Evento) => prisma.$transaction((tx) => seats.applyAsaasEvent(tx, r));
  const compra = async (sufixo: string) =>
    prisma.groupOfferPurchase.create({
      data: {
        offerId,
        buyerName: 'Rafa',
        buyerEmail: `${stamp}-${sufixo}@test.local`,
        amountCents: 14_900,
        providerPaymentId: `${stamp}-${sufixo}`,
        paymentUrl: 'https://sandbox.asaas.com/i/x',
      },
    });

  beforeAll(async () => {
    dona = (
      await prisma.user.create({
        data: { logtoSub: `${stamp}-dona`, email: `${stamp}-dona@test.local`, name: 'Dona' },
      })
    ).id;
    g = (
      await prisma.group.create({
        data: {
          type: 'SPONSORED',
          name: 'Academia',
          slug: `${stamp}-g`,
          ownerId: dona,
          memberships: { create: { userId: dona, role: 'OWNER', status: 'ACTIVE' } },
        },
      })
    ).id;
    offerId = (
      await prisma.groupOffer.create({
        data: { groupId: g, slug: 'verao', title: 'Verão', priceCents: 14_900, status: 'ACTIVE' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: g } });
    await prisma.user.deleteMany({ where: { id: dona } });
    await prisma.$disconnect();
  });

  it('pago marca PAID com a data; repetir não muda nada', async () => {
    const c = await compra('paga');
    expect(await aplicar(evento(c.providerPaymentId!, 'PAYMENT_RECEIVED', 'PAID'))).toBeNull();
    const paga = await prisma.groupOfferPurchase.findUniqueOrThrow({ where: { id: c.id } });
    expect(paga.status).toBe('PAID');
    expect(paga.paidAt).not.toBeNull();
    expect(await aplicar(evento(c.providerPaymentId!, 'PAYMENT_CONFIRMED', 'PAID'))).toBe(
      'sem_efeito',
    );
    // Vencida depois de paga (fora de ordem): continua paga.
    expect(await aplicar(evento(c.providerPaymentId!, 'PAYMENT_OVERDUE', 'OVERDUE'))).toBe(
      'sem_efeito',
    );
    expect(
      (await prisma.groupOfferPurchase.findUniqueOrThrow({ where: { id: c.id } })).status,
    ).toBe('PAID');
  });

  it('vencida ou cartão recusado marca FAILED; pagar depois vira PAID', async () => {
    const c = await compra('falha');
    expect(await aplicar(evento(c.providerPaymentId!, 'PAYMENT_OVERDUE', 'OVERDUE'))).toBeNull();
    const falhou = await prisma.groupOfferPurchase.findUniqueOrThrow({ where: { id: c.id } });
    expect(falhou.status).toBe('FAILED');
    expect(falhou.failedAt).not.toBeNull();
    await aplicar(evento(c.providerPaymentId!, 'PAYMENT_RECEIVED', 'PAID'));
    expect(
      (await prisma.groupOfferPurchase.findUniqueOrThrow({ where: { id: c.id } })).status,
    ).toBe('PAID');

    const recusada = await compra('recusa');
    await aplicar(
      evento(recusada.providerPaymentId!, 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', 'OVERDUE'),
    );
    expect(
      (await prisma.groupOfferPurchase.findUniqueOrThrow({ where: { id: recusada.id } })).status,
    ).toBe('FAILED');
  });

  it('estorno marca REFUNDED', async () => {
    const c = await compra('estorno');
    await aplicar(evento(c.providerPaymentId!, 'PAYMENT_RECEIVED', 'PAID'));
    expect(await aplicar(evento(c.providerPaymentId!, 'PAYMENT_REFUNDED', 'VOID'))).toBeNull();
    expect(
      (await prisma.groupOfferPurchase.findUniqueOrThrow({ where: { id: c.id } })).status,
    ).toBe('REFUNDED');
  });
});
