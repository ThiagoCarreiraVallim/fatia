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
// Os casos antigos são sem teste grátis; o teste tem o seu bloco no fim.
const configCom = (env: Record<string, unknown>) =>
  ({
    get: (k: string, padrao?: unknown) =>
      ({ AI_REQUIRES_PLAN: true, BILLING_PRO_TRIAL_DAYS: 0, ...env })[k] ?? padrao,
  }) as unknown as ConfigService;
const config = configCom({});

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

function montar(cfg: ConfigService = config) {
  const provedor = provedorFalso();
  const direitos = new SubscriptionEntitlementsService(prisma, cfg);
  const service = new UserSubscriptionService(prisma, cfg, direitos, provedor);
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
      service.handleAsaasWebhook({ 'asaas-access-token': 'errado' }, '{}'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('pagamento confirmado vira PRO até o fim do ciclo; a reentrega é no-op', async () => {
    const { service } = montar();
    const sub = await prisma.userSubscription.findFirstOrThrow({
      where: { userId: userA, status: 'PENDING' },
    });
    const corpo = evento(`${stamp}-1`, 'PAYMENT_CONFIRMED', sub.providerRef!, '2026-10-15');

    expect(await service.handleAsaasWebhook({ 'asaas-access-token': TOKEN }, corpo)).toEqual({
      received: true,
    });
    const plano = await service.plan(userA);
    expect(plano).toMatchObject({
      tier: 'PRO',
      source: 'ASAAS',
      status: 'ACTIVE',
      paymentUrl: null,
    });
    expect(plano.currentPeriodEnd).toBe(fimDoPeriodo('2026-10-15', 'YEARLY').toISOString());

    expect(await service.handleAsaasWebhook({ 'asaas-access-token': TOKEN }, corpo)).toEqual({
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

    await service.handleAsaasWebhook({ 'asaas-access-token': TOKEN }, corpo);

    expect(await service.plan(userA)).toMatchObject({ tier: 'PRO', status: 'ACTIVE' });
    const ev = await prisma.billingWebhookEvent.findFirstOrThrow({
      where: { eventId: `${stamp}-2` },
    });
    expect(ev.error).toBe('sem_efeito');
    // O payload guarda só ids, status e datas.
    expect(Object.keys(ev.payload as object).sort()).toEqual([
      'dueDate',
      'paymentId',
      'status',
      'subscriptionId',
    ]);
  });

  it('evento de assinatura que não é nossa é registrado e responde 200', async () => {
    const { service } = montar();
    const corpo = evento(`${stamp}-3`, 'PAYMENT_CONFIRMED', 'sub_de_outra_coisa', '2026-10-15');
    expect(await service.handleAsaasWebhook({ 'asaas-access-token': TOKEN }, corpo)).toEqual({
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
    expect(await service.plan(userB)).toMatchObject({ tier: 'FREE', status: null });
    await expect(service.cancel(userB)).rejects.toBeInstanceOf(NotFoundException);
    expect(provedor.cancelSubscription).not.toHaveBeenCalled();
  });

  it('cancelar encerra a recorrência e mantém o PRO até o fim do período', async () => {
    const { service, provedor } = montar();
    const sub = await prisma.userSubscription.findFirstOrThrow({
      where: { userId: userA, status: 'ACTIVE' },
    });

    const plano = await service.cancel(userA);

    expect(provedor.cancelSubscription).toHaveBeenCalledWith(sub.providerRef);
    expect(plano).toMatchObject({ tier: 'PRO', cancelAtPeriodEnd: true });

    // O Asaas confirma a exclusão com SUBSCRIPTION_DELETED: continua PRO.
    await service.handleAsaasWebhook(
      { 'asaas-access-token': TOKEN },
      JSON.stringify({
        id: `${stamp}-4`,
        event: 'SUBSCRIPTION_DELETED',
        subscription: { id: sub.providerRef },
      }),
    );
    expect(await service.plan(userA)).toMatchObject({ tier: 'PRO', cancelAtPeriodEnd: true });
  });

  it('apagar a conta encerra a recorrência viva no provedor', async () => {
    const { service, provedor } = montar();
    await prisma.userSubscription.create({
      data: { userId: userB, source: 'ASAAS', status: 'ACTIVE', providerRef: `sub_${stamp}_b` },
    });

    await service.cancelBeforeAccountDeletion(userB);

    expect(provedor.cancelSubscription).toHaveBeenCalledWith(`sub_${stamp}_b`);
  });

  it('apagar a conta no meio do teste grátis também encerra a recorrência (#386)', async () => {
    const { service, provedor } = montar();
    await prisma.userSubscription.create({
      data: {
        userId: userB,
        source: 'ASAAS',
        status: 'TRIALING',
        providerRef: `sub_${stamp}_b_teste`,
        trialEndsAt: new Date(Date.now() + 5 * 86_400_000),
        currentPeriodEnd: new Date(Date.now() + 5 * 86_400_000),
      },
    });

    await service.cancelBeforeAccountDeletion(userB);

    expect(provedor.cancelSubscription).toHaveBeenCalledWith(`sub_${stamp}_b_teste`);
  });
});

/**
 * Teste grátis e forma de pagamento na web (#386): a primeira cobrança vence no
 * fim do teste, o teste é lido como PRO, e cada pessoa tem um só.
 */
describe('UserSubscriptionService — teste grátis e forma de pagamento (banco real)', () => {
  const stamp = `teste-gratis-${Date.now()}`;
  const comTeste = configCom({ BILLING_PRO_TRIAL_DAYS: 7 });
  let nova: string;
  let jaFoiPro: string;
  let pagante: string;

  beforeAll(async () => {
    const [a, b, c] = await Promise.all(
      ['nova', 'ja-foi-pro', 'pagante'].map((s) =>
        prisma.user.create({
          // Cliente do Asaas já criado: o dublê devolve sempre o mesmo id.
          data: {
            logtoSub: `${stamp}-${s}`,
            email: `${stamp}-${s}@test.local`,
            name: s,
            asaasCustomerId: `${stamp}-cus-${s}`,
          },
        }),
      ),
    );
    nova = a.id;
    jaFoiPro = b.id;
    pagante = c.id;
    // Teve PRO pela loja, que já expirou.
    await prisma.userSubscription.create({
      data: {
        userId: jaFoiPro,
        source: 'APPLE',
        status: 'EXPIRED',
        interval: 'MONTHLY',
        providerRef: `${stamp}-loja`,
        currentPeriodEnd: new Date(Date.now() - 40 * 86_400_000),
      },
    });
  }, 60_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [nova, jaFoiPro, pagante] } } });
    await prisma.billingWebhookEvent.deleteMany({ where: { eventId: { startsWith: stamp } } });
  });

  it('quem nunca teve PRO vê o teste disponível no plano', async () => {
    const { service } = montar(comTeste);
    expect(await service.plan(nova)).toMatchObject({
      tier: 'FREE',
      state: 'FREE',
      trialEligible: true,
      trialDays: 7,
      paidBy: null,
    });
  });

  it('checkout de quem pode ter teste: PRO na hora, primeira cobrança no fim do teste', async () => {
    const { service, provedor } = montar(comTeste);
    const antes = Date.now();
    const plano = await service.checkout(nova, {
      interval: 'YEARLY',
      cpf: CPF,
      paymentMethod: 'PIX',
    });

    expect(plano).toMatchObject({
      tier: 'PRO',
      state: 'TRIAL',
      reason: 'teste',
      paymentMethod: 'PIX',
      paidBy: 'PERSONAL',
      trialEligible: false,
    });
    expect(plano.paymentUrl).toMatch(/^https:\/\//);
    const fim = new Date(plano.trialEndsAt!).getTime();
    expect(fim - antes).toBeGreaterThanOrEqual(7 * 86_400_000 - 60_000);
    expect(fim - antes).toBeLessThan(8 * 86_400_000);

    const [chamada] = provedor.createSubscription.mock.calls[0] as unknown as [
      { nextDueAt: Date; billingType: string },
    ];
    expect(chamada.billingType).toBe('PIX');
    expect(chamada.nextDueAt.getTime() - antes).toBeGreaterThanOrEqual(7 * 86_400_000 - 60_000);

    const conta = await prisma.user.findUniqueOrThrow({ where: { id: nova } });
    expect(conta.proTrialStartedAt).not.toBeNull();
  });

  it('o pagamento no fim do teste vira PRO anual', async () => {
    const { service } = montar(comTeste);
    const sub = await prisma.userSubscription.findFirstOrThrow({
      where: { userId: nova, status: 'TRIALING' },
    });
    const due = sub.trialEndsAt!.toISOString().slice(0, 10);
    await service.handleAsaasWebhook(
      { 'asaas-access-token': TOKEN },
      evento(`${stamp}-1`, 'PAYMENT_RECEIVED', sub.providerRef!, due),
    );
    expect(await service.plan(nova)).toMatchObject({
      tier: 'PRO',
      state: 'ACTIVE',
      paymentUrl: null,
    });
  });

  it('quem já teve teste ou já foi PRO assina sem teste: checkout pendente', async () => {
    const { service, provedor } = montar(comTeste);
    expect(await service.plan(jaFoiPro)).toMatchObject({ trialEligible: false });
    const plano = await service.checkout(jaFoiPro, {
      interval: 'MONTHLY',
      cpf: CPF,
      paymentMethod: 'BOLETO',
    });
    expect(plano).toMatchObject({ tier: 'FREE', state: 'PENDING', paymentMethod: 'BOLETO' });
    const [chamada] = provedor.createSubscription.mock.calls[0] as unknown as [
      { nextDueAt: Date; billingType: string },
    ];
    expect(chamada.billingType).toBe('BOLETO');
    expect(Math.abs(chamada.nextDueAt.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it('cancelar no teste encerra a recorrência: nada é cobrado e o PRO vai até o fim do teste', async () => {
    const { service, provedor } = montar(comTeste);
    const u = await prisma.user.create({
      data: {
        logtoSub: `${stamp}-cancela-teste`,
        email: `${stamp}-cancela-teste@test.local`,
        name: 'cancela',
        asaasCustomerId: `${stamp}-cus-cancela`,
      },
    });
    try {
      const teste = await service.checkout(u.id, { interval: 'MONTHLY', cpf: CPF });
      expect(teste.state).toBe('TRIAL');
      const plano = await service.cancel(u.id);
      expect(provedor.cancelSubscription).toHaveBeenCalledTimes(1);
      expect(plano).toMatchObject({
        tier: 'PRO',
        state: 'CANCELED',
        cancelAtPeriodEnd: true,
        trialEndsAt: teste.trialEndsAt,
      });
    } finally {
      await prisma.user.delete({ where: { id: u.id } });
    }
  });

  it('trocar a forma de pagamento antes de pagar abre outro checkout', async () => {
    const { service, provedor } = montar(comTeste);
    const plano = await service.checkout(jaFoiPro, {
      interval: 'MONTHLY',
      cpf: CPF,
      paymentMethod: 'PIX',
    });
    expect(plano).toMatchObject({ state: 'PENDING', paymentMethod: 'PIX' });
    expect(provedor.cancelSubscription).toHaveBeenCalledTimes(1);
  });

  it('a renovação em aberto guarda o link, e o atraso mostra carência com o link (web)', async () => {
    const { service } = montar(comTeste);
    const ref = `${stamp}-renova`;
    const fim = new Date(Date.now() + 2 * 86_400_000);
    await prisma.userSubscription.create({
      data: {
        userId: pagante,
        source: 'ASAAS',
        status: 'ACTIVE',
        interval: 'MONTHLY',
        providerRef: ref,
        paymentMethod: 'PIX',
        currentPeriodEnd: fim,
      },
    });
    const due = fim.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    await service.handleAsaasWebhook(
      { 'asaas-access-token': TOKEN },
      JSON.stringify({
        id: `${stamp}-2`,
        event: 'PAYMENT_CREATED',
        payment: {
          id: 'pay_r',
          status: 'PENDING',
          dueDate: due,
          subscription: ref,
          invoiceUrl: 'https://www.asaas.com/i/pay_r',
        },
      }),
    );
    expect(await service.plan(pagante)).toMatchObject({
      state: 'ACTIVE',
      paymentUrl: 'https://www.asaas.com/i/pay_r',
      paymentMethod: 'PIX',
    });
  });
});
