import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { AsaasProvider } from '../asaas/asaas.provider';
import type { SubscriptionProvider } from '../billing-provider.port';
import { SubscriptionEntitlementsService } from '../subscription-entitlements.service';
import { fimDoPeriodo, UserSubscriptionService } from '../user-subscription.service';

/**
 * Assinatura PRO pela web contra o Postgres de teste (ADR 024).
 *
 * O provedor é dublê nas chamadas que saem (criar, cancelar), mas a
 * verificação do webhook é a do `AsaasProvider` de verdade, sem rede: o corpo
 * dos testes é o JSON que o Asaas manda, e é a tradução dele que se prova.
 *
 * Requer `DATABASE_URL` com migrations aplicadas.
 */
const TOKEN = 'segredo-do-webhook';
const CPF = '529.982.247-25';

const prisma = new PrismaService();
const config = {
  get: (k: string, padrao?: unknown) =>
    (({ AI_REQUIRES_PLAN: true }) as Record<string, unknown>)[k] ?? padrao,
} as unknown as ConfigService;

function provedorFalso() {
  const real = new AsaasProvider({
    baseUrl: 'http://asaas.invalid',
    apiKey: 'k',
    webhookToken: TOKEN,
  });
  let n = 0;
  return {
    ensurePersonCustomer: jest.fn(async () => ({ providerCustomerId: 'cus_1' })),
    createSubscription: jest.fn(async () => ({
      providerSubscriptionId: `sub_${Date.now()}_${++n}`,
    })),
    firstPaymentUrl: jest.fn(async (id: string) => `https://sandbox.asaas.com/i/${id}`),
    cancelSubscription: jest.fn(async (_id: string) => undefined),
    verifySubscriptionWebhook: real.verifySubscriptionWebhook.bind(real),
  } satisfies SubscriptionProvider;
}

function montar() {
  const provedor = provedorFalso();
  const direitos = new SubscriptionEntitlementsService(prisma, config);
  const service = new UserSubscriptionService(prisma, config, direitos, provedor);
  return { service, provedor };
}

const evento = (id: string, event: string, sub: string, dueDate: string) =>
  JSON.stringify({
    id,
    event,
    payment: { id: `pay_${id}`, status: 'CONFIRMED', dueDate, subscription: sub },
  });

describe('UserSubscriptionService (banco real)', () => {
  let userA: string;
  let userB: string;
  const stamp = `assinatura-${Date.now()}`;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('Defina DATABASE_URL do banco de teste com as migrations aplicadas.');
    }
    const [a, b] = await Promise.all(
      ['a', 'b'].map((s) =>
        prisma.user.create({
          data: {
            logtoSub: `${stamp}-${s}`,
            email: `${stamp}-${s}@test.local`,
            name: `Pessoa ${s}`,
          },
        }),
      ),
    );
    userA = a.id;
    userB = b.id;
  }, 60_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.billingWebhookEvent.deleteMany({ where: { eventId: { startsWith: stamp } } });
    await prisma.$disconnect();
  });

  it('recusa CPF inválido antes de falar com o provedor', async () => {
    const { service, provedor } = montar();
    await expect(
      service.checkout(userA, { interval: 'MONTHLY', cpf: '111.111.111-11' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(provedor.ensurePersonCustomer).not.toHaveBeenCalled();
  });

  it('checkout abre PENDING com o link, e tocar de novo devolve o mesmo link', async () => {
    const { service, provedor } = montar();

    const primeiro = await service.checkout(userA, { interval: 'MONTHLY', cpf: CPF });
    expect(primeiro).toMatchObject({ tier: 'FREE', reason: 'pendente', status: 'PENDING' });
    expect(primeiro.paymentUrl).toMatch(/^https:\/\/sandbox\.asaas\.com\/i\/sub_/);
    expect(provedor.ensurePersonCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ userId: userA, cpf: '52998224725' }),
    );
    expect(provedor.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ valueCents: 1990, cycle: 'MONTHLY' }),
    );

    const segundo = await service.checkout(userA, { interval: 'MONTHLY', cpf: CPF });
    expect(segundo.paymentUrl).toBe(primeiro.paymentUrl);
    expect(provedor.createSubscription).toHaveBeenCalledTimes(1);

    // O CPF não fica no banco; só o id do cliente.
    const conta = await prisma.user.findUniqueOrThrow({ where: { id: userA } });
    expect(conta.asaasCustomerId).toBe('cus_1');
    expect(JSON.stringify(conta)).not.toContain('52998224725');
  });

  it('trocar para anual antes de pagar fecha o checkout mensal', async () => {
    const { service, provedor } = montar();
    const antigo = await prisma.userSubscription.findFirstOrThrow({
      where: { userId: userA, status: 'PENDING' },
    });

    const anual = await service.checkout(userA, { interval: 'YEARLY', cpf: CPF });

    expect(provedor.cancelSubscription).toHaveBeenCalledWith(antigo.providerRef);
    expect(provedor.ensurePersonCustomer).not.toHaveBeenCalled(); // reusa o cliente
    expect(provedor.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ valueCents: 17900, cycle: 'YEARLY' }),
    );
    expect(anual).toMatchObject({ interval: 'YEARLY', status: 'PENDING' });
    expect(
      (await prisma.userSubscription.findUniqueOrThrow({ where: { id: antigo.id } })).status,
    ).toBe('CANCELED');
  });

  it('webhook com token errado é 401 e não grava nada', async () => {
    const { service } = montar();
    await expect(
      service.processarWebhookAsaas({ 'asaas-access-token': 'errado' }, '{}'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('pagamento confirmado vira PRO até o fim do ciclo; a reentrega é no-op', async () => {
    const { service } = montar();
    const sub = await prisma.userSubscription.findFirstOrThrow({
      where: { userId: userA, status: 'PENDING' },
    });
    const corpo = evento(`${stamp}-1`, 'PAYMENT_CONFIRMED', sub.providerRef!, '2026-10-15');

    expect(await service.processarWebhookAsaas({ 'asaas-access-token': TOKEN }, corpo)).toEqual({
      received: true,
    });
    const plano = await service.plano(userA);
    expect(plano).toMatchObject({
      tier: 'PRO',
      source: 'ASAAS',
      status: 'ACTIVE',
      paymentUrl: null,
    });
    expect(plano.currentPeriodEnd).toBe(fimDoPeriodo('2026-10-15', 'YEARLY').toISOString());

    expect(await service.processarWebhookAsaas({ 'asaas-access-token': TOKEN }, corpo)).toEqual({
      received: true,
      duplicate: true,
    });
  });

  it('atraso de uma cobrança já superada (fora de ordem) não derruba o PRO', async () => {
    const { service } = montar();
    const sub = await prisma.userSubscription.findFirstOrThrow({
      where: { userId: userA, status: 'ACTIVE' },
    });
    const corpo = evento(`${stamp}-2`, 'PAYMENT_OVERDUE', sub.providerRef!, '2026-10-15');

    await service.processarWebhookAsaas({ 'asaas-access-token': TOKEN }, corpo);

    expect(await service.plano(userA)).toMatchObject({ tier: 'PRO', status: 'ACTIVE' });
    const ev = await prisma.billingWebhookEvent.findFirstOrThrow({
      where: { eventId: `${stamp}-2` },
    });
    expect(ev.error).toBe('sem_efeito');
    // O payload guarda só ids, status e datas.
    expect(Object.keys(ev.payload as object).sort()).toEqual([
      'dueDate',
      'status',
      'subscriptionId',
    ]);
  });

  it('evento de assinatura que não é nossa é registrado e responde 200', async () => {
    const { service } = montar();
    const corpo = evento(`${stamp}-3`, 'PAYMENT_CONFIRMED', 'sub_de_outra_coisa', '2026-10-15');
    expect(await service.processarWebhookAsaas({ 'asaas-access-token': TOKEN }, corpo)).toEqual({
      received: true,
      ignored: 'assinatura_desconhecida',
    });
  });

  it('quem já é PRO não abre outro checkout', async () => {
    const { service } = montar();
    await expect(service.checkout(userA, { interval: 'MONTHLY', cpf: CPF })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('isolamento: a outra pessoa não vê nem cancela a assinatura de A', async () => {
    const { service, provedor } = montar();
    expect(await service.plano(userB)).toMatchObject({ tier: 'FREE', status: null });
    await expect(service.cancelar(userB)).rejects.toBeInstanceOf(NotFoundException);
    expect(provedor.cancelSubscription).not.toHaveBeenCalled();
  });

  it('cancelar encerra a recorrência e mantém o PRO até o fim do período', async () => {
    const { service, provedor } = montar();
    const sub = await prisma.userSubscription.findFirstOrThrow({
      where: { userId: userA, status: 'ACTIVE' },
    });

    const plano = await service.cancelar(userA);

    expect(provedor.cancelSubscription).toHaveBeenCalledWith(sub.providerRef);
    expect(plano).toMatchObject({ tier: 'PRO', cancelAtPeriodEnd: true });

    // O Asaas confirma a exclusão com SUBSCRIPTION_DELETED: continua PRO.
    await service.processarWebhookAsaas(
      { 'asaas-access-token': TOKEN },
      JSON.stringify({
        id: `${stamp}-4`,
        event: 'SUBSCRIPTION_DELETED',
        subscription: { id: sub.providerRef },
      }),
    );
    expect(await service.plano(userA)).toMatchObject({ tier: 'PRO', cancelAtPeriodEnd: true });
  });

  it('apagar a conta encerra a recorrência viva no provedor', async () => {
    const { service, provedor } = montar();
    await prisma.userSubscription.create({
      data: { userId: userB, source: 'ASAAS', status: 'ACTIVE', providerRef: `sub_${stamp}_b` },
    });

    await service.encerrarAntesDeApagar(userB);

    expect(provedor.cancelSubscription).toHaveBeenCalledWith(`sub_${stamp}_b`);
  });
});
