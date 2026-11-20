import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import type { EmailService } from '../../notifications/email.service';
import { OfferService } from '../offer.service';

const DIA = 86_400_000;

/**
 * Ofertas (#403, Pn-37 e Pn-37b): programas vendidos pela comunidade, pagos
 * pelo Asaas. A venda em si (checkout público) é da #421 e fica atrás de
 * `OFFERS_SALES_ENABLED`; aqui o dono cria, publica, encerra, duplica e
 * acompanha vendas, receita e pagamentos que falharam. Só o dono, e todo id
 * do corpo amarrado à comunidade da URL.
 */
describe('ofertas (#403, banco real)', () => {
  const prisma = new PrismaService();
  const env: Record<string, unknown> = {
    WEB_ORIGIN: 'https://fat.ia.br',
    OFFERS_SALES_ENABLED: false,
    OFFERS_PLATFORM_FEE_PERCENT: 10,
  };
  const config = {
    get: (k: string, padrao?: unknown) => env[k] ?? padrao,
  } as unknown as ConfigService;
  const send = jest.fn(async (_m: { to: string; subject: string; text: string }) => true);
  const offers = new OfferService(prisma, config, { send } as unknown as EmailService);
  const stamp = `ofertas-${Date.now()}`;
  const users: Record<'dona' | 'admin' | 'outra' | 'rafa' | 'lia' | 'ana', string> = {
    dona: '',
    admin: '',
    outra: '',
    rafa: '',
    lia: '',
    ana: '',
  };
  let g = '';
  let slug = '';
  let outroG = '';
  let programaDeOutro = '';

  beforeAll(async () => {
    for (const k of Object.keys(users) as (keyof typeof users)[]) {
      users[k] = (
        await prisma.user.create({
          data: { logtoSub: `${stamp}-${k}`, email: `${stamp}-${k}@test.local`, name: k },
        })
      ).id;
    }
    slug = `${stamp}-academia`;
    g = (
      await prisma.group.create({
        data: {
          type: 'SPONSORED',
          name: 'Academia Demo',
          slug,
          ownerId: users.dona,
          memberships: {
            create: [
              { userId: users.dona, role: 'OWNER', status: 'ACTIVE' },
              { userId: users.admin, role: 'ADMIN', status: 'ACTIVE' },
            ],
          },
        },
      })
    ).id;
    outroG = (
      await prisma.group.create({
        data: {
          type: 'SPONSORED',
          name: 'Outra',
          slug: `${stamp}-outra`,
          ownerId: users.outra,
          memberships: { create: { userId: users.outra, role: 'OWNER', status: 'ACTIVE' } },
        },
      })
    ).id;
    const pool = await prisma.groupSeatPool.create({
      data: { groupId: outroG, seats: 1, unitPriceCents: 1490, status: 'ACTIVE' },
    });
    programaDeOutro = (
      await prisma.groupProgram.create({
        data: {
          groupId: outroG,
          poolId: pool.id,
          name: 'Alheio',
          kind: 'CLASS',
          seats: 1,
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 10 * DIA),
          unitPriceCents: 1490,
          amountCents: 1490,
          chargeStatus: 'ACTIVE',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: [g, outroG] } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
    await prisma.$disconnect();
  });

  const base = {
    title: 'Verão 21',
    description: '21 dias de treino e alimentação com a Helena.',
    priceCents: 14_900,
    spots: 30,
    startDate: '2026-12-01',
    endDate: '2026-12-21',
    extras: 'questionário de início',
  };

  it('cria rascunho com link de venda pelo código da comunidade, publica e encerra', async () => {
    const o = await offers.create(users.dona, g, base);
    expect(o).toMatchObject({
      status: 'DRAFT',
      slug: 'verao-21',
      saleUrl: `https://fat.ia.br/${slug}/verao-21`,
      stats: { sales: 0, spotsLeft: 30, revenueCents: 0, netCents: 0 },
    });
    // Mesmo título: outro link.
    expect((await offers.create(users.dona, g, base)).slug).toBe('verao-21-2');

    expect((await offers.publish(users.dona, g, o.id)).status).toBe('ACTIVE');
    const lista = await offers.list(g);
    expect(lista.salesEnabled).toBe(false);
    expect(lista.platformFeePercent).toBe(10);
    expect(lista.offers.map((x) => x.id)).toContain(o.id);

    const fechada = await offers.close(users.dona, g, o.id);
    expect(fechada.status).toBe('CLOSED');
    await expect(offers.update(users.dona, g, o.id, { priceCents: 100 })).rejects.toThrow(
      ConflictException,
    );
  });

  it('duplicar copia num rascunho com as datas um mês depois', async () => {
    const o = await offers.create(users.dona, g, { ...base, title: 'Dezembro' });
    const d = await offers.duplicate(users.dona, g, o.id);
    expect(d).toMatchObject({
      status: 'DRAFT',
      title: 'Dezembro',
      priceCents: 14_900,
      startDate: '2027-01-01',
      endDate: '2027-01-21',
    });
    expect(d.id).not.toBe(o.id);
  });

  it('vendas, receita (com a taxa da plataforma), ativaram em 48 h e pagamentos que falharam', async () => {
    const o = await offers.create(users.dona, g, { ...base, title: 'Com vendas' });
    await offers.publish(users.dona, g, o.id);
    const pago = (userId: string | null, nome: string) =>
      prisma.groupOfferPurchase.create({
        data: {
          offerId: o.id,
          userId,
          buyerName: nome,
          buyerEmail: `${stamp}-${nome}@test.local`,
          amountCents: 14_900,
          status: 'PAID',
          paidAt: new Date(Date.now() - 3 * DIA),
          providerPaymentId: `${stamp}-${nome}`,
        },
      });
    await pago(users.ana, 'ana');
    await pago(null, 'semconta');
    // A Ana registrou uma refeição depois da compra: a oferta não lê isso (sem
    // consentimento do comprador, até a #421).
    await prisma.meal.create({
      data: {
        userId: users.ana,
        mealType: 'LUNCH',
        eatenAt: new Date(Date.now() - 2 * DIA),
        createdAt: new Date(Date.now() - 2 * DIA),
      },
    });
    const falhou = await prisma.groupOfferPurchase.create({
      data: {
        offerId: o.id,
        userId: users.rafa,
        buyerName: 'Rafa Gomes',
        buyerEmail: `${stamp}-rafa@test.local`,
        amountCents: 14_900,
        status: 'FAILED',
        failedAt: new Date(Date.now() - DIA),
        paymentUrl: 'https://sandbox.asaas.com/i/rafa',
      },
    });

    const refeicoes = jest.spyOn(prisma.meal, 'count');
    const treinos = jest.spyOn(prisma.workoutSession, 'count');
    const [v] = (await offers.list(g)).offers.filter((x) => x.id === o.id);
    expect(refeicoes).not.toHaveBeenCalled();
    expect(treinos).not.toHaveBeenCalled();
    refeicoes.mockRestore();
    treinos.mockRestore();
    expect(v!.stats).toEqual({
      sales: 2,
      spotsLeft: 28,
      revenueCents: 29_800,
      netCents: 26_820,
    });
    expect(v).toMatchObject({
      failed: [{ purchaseId: falhou.id, name: 'Rafa Gomes' }],
    });

    await offers.resendLink(users.dona, g, o.id, falhou.id);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: `${stamp}-rafa@test.local` }));
    expect(send.mock.calls[0]![0].text).toContain('https://sandbox.asaas.com/i/rafa');
    // Reenviar de novo logo em seguida não manda outra vez.
    await expect(offers.resendLink(users.dona, g, o.id, falhou.id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('isolamento: programa, oferta e compra de outra comunidade são 404', async () => {
    await expect(
      offers.create(users.dona, g, { ...base, title: 'X', programId: programaDeOutro }),
    ).rejects.toThrow(NotFoundException);
    const alheia = await offers.create(users.outra, outroG, { ...base, title: 'Alheia' });
    await expect(offers.publish(users.dona, g, alheia.id)).rejects.toThrow(NotFoundException);
    const minha = await offers.create(users.dona, g, { ...base, title: 'Minha' });
    const compraAlheia = await prisma.groupOfferPurchase.create({
      data: {
        offerId: alheia.id,
        buyerName: 'Z',
        buyerEmail: `${stamp}-z@test.local`,
        amountCents: 100,
        status: 'FAILED',
        paymentUrl: 'https://x',
      },
    });
    await expect(offers.resendLink(users.dona, g, minha.id, compraAlheia.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('só o dono; preço inválido é 400', async () => {
    await expect(offers.create(users.admin, g, base)).rejects.toThrow(ForbiddenException);
    await expect(offers.create(users.dona, g, { ...base, priceCents: 0 })).rejects.toThrow(
      BadRequestException,
    );
  });
});
