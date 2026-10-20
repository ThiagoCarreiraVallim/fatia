import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { AsaasProvider } from '../asaas/asaas.provider';
import type { SeatProvider, SubscriptionProvider } from '../billing-provider.port';
import { SeatPoolService } from '../seat-pool.service';
import { SubscriptionEntitlementsService } from '../subscription-entitlements.service';
import { UserSubscriptionService } from '../user-subscription.service';

/**
 * Assentos de comunidade no Postgres real (ADR 025): compra, atribuição,
 * aumento com pró-rata, redução na renovação, webhook das três tabelas e o
 * direito à IA que sai disso.
 *
 * O provedor é dublê nas chamadas que saem; a verificação do webhook é a do
 * `AsaasProvider` de verdade, sem rede.
 */
const TOKEN = 'segredo-do-webhook';
const CNPJ = '11.222.333/0001-81';
const DIA = 86_400_000;

const prisma = new PrismaService();
const config = {
  get: (k: string, padrao?: unknown) =>
    (({ AI_REQUIRES_PLAN: true, BILLING_SEAT_MONTHLY_CENTS: 1490 }) as Record<string, unknown>)[
      k
    ] ?? padrao,
} as unknown as ConfigService;

function provedorFalso() {
  const real = new AsaasProvider({
    baseUrl: 'http://asaas.invalid',
    apiKey: 'k',
    webhookToken: TOKEN,
  });
  let n = 0;
  return {
    ensureGroupCustomer: jest.fn(async () => ({ providerCustomerId: 'cus_g' })),
    ensurePersonCustomer: jest.fn(async () => ({ providerCustomerId: 'cus_p' })),
    createSubscription: jest.fn(async () => ({
      providerSubscriptionId: `sub_seat_${Date.now()}_${++n}`,
    })),
    firstPaymentUrl: jest.fn(async (id: string) => `https://sandbox.asaas.com/i/${id}`),
    cancelSubscription: jest.fn(async (_id: string) => undefined),
    updateSubscriptionValue: jest.fn(async (_id: string, _v: number) => undefined),
    createSubscriptionCharge: jest.fn(async () => ({
      providerChargeId: `pay_adj_${Date.now()}_${++n}`,
      url: 'https://sandbox.asaas.com/i/adj',
    })),
    verifySubscriptionWebhook: real.verifySubscriptionWebhook.bind(real),
  } satisfies SeatProvider & SubscriptionProvider;
}

function montar() {
  const provedor = provedorFalso();
  const direitos = new SubscriptionEntitlementsService(prisma, config);
  const assentos = new SeatPoolService(prisma, config, provedor);
  const assinaturas = new UserSubscriptionService(prisma, config, direitos, provedor, assentos);
  return { provedor, direitos, assentos, assinaturas };
}

const webhook = (s: UserSubscriptionService, corpo: object) =>
  s.processarWebhookAsaas({ 'asaas-access-token': TOKEN }, JSON.stringify(corpo));

let ev = 0;
const pagamento = (
  event: string,
  extra: {
    subscription?: string;
    id?: string;
    dueDate: string;
    externalReference?: string;
    value?: number;
    invoiceUrl?: string;
  },
) => ({
  id: `evt_seat_${Date.now()}_${++ev}`,
  event,
  payment: { id: extra.id ?? `pay_${ev}`, status: 'CONFIRMED', ...extra },
});

/** `YYYY-MM-DD` daqui a `n` dias (UTC basta: o teste não depende da virada). */
const diaIso = (n: number) => new Date(Date.now() + n * DIA).toISOString().slice(0, 10);

describe('assentos de comunidade (banco real)', () => {
  const stamp = `assentos-${Date.now()}`;
  const usuarios: string[] = [];
  const grupos: string[] = [];
  let k = 0;

  async function pessoa(nome: string) {
    k += 1;
    const u = await prisma.user.create({
      data: { logtoSub: `${stamp}-${k}`, email: `${stamp}-${k}@test.local`, name: nome },
    });
    usuarios.push(u.id);
    return u.id;
  }

  /** Comunidade com a dona e `membros` membros ACTIVE. */
  async function comunidade(membros = 2) {
    const dona = await pessoa('Dona');
    const grupo = await prisma.group.create({
      data: {
        type: 'SPONSORED',
        name: `Academia ${k}`,
        slug: `${stamp}-${k}`,
        ownerId: dona,
        memberships: { create: { userId: dona, role: 'OWNER', status: 'ACTIVE' } },
      },
    });
    grupos.push(grupo.id);
    const ms: Array<{ userId: string; membershipId: string }> = [];
    for (let i = 0; i < membros; i++) {
      const userId = await pessoa(`Membro ${i + 1}`);
      const m = await prisma.groupMembership.create({
        data: { groupId: grupo.id, userId, role: 'MEMBER', status: 'ACTIVE' },
      });
      ms.push({ userId, membershipId: m.id });
    }
    return { dona, groupId: grupo.id, membros: ms };
  }

  /** Comunidade com pool já pago (checkout + confirmação pelo webhook). */
  async function comunidadePaga(seats: number, membros = 2) {
    const c = await comunidade(membros);
    const m = montar();
    await m.assentos.checkout(c.dona, c.groupId, { seats, taxId: CNPJ });
    const pool = await prisma.groupSeatPool.findUniqueOrThrow({ where: { groupId: c.groupId } });
    await webhook(
      m.assinaturas,
      pagamento('PAYMENT_CONFIRMED', {
        subscription: pool.providerRef as string,
        dueDate: diaIso(-10),
      }),
    );
    return { ...c, ...m, providerRef: pool.providerRef as string };
  }

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error('Defina DATABASE_URL do banco de teste com as migrations aplicadas.');
    }
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.$disconnect();
  });

  describe('compra', () => {
    it('abre a assinatura mensal com assentos × preço e referência da comunidade, sem guardar o documento', async () => {
      const { dona, groupId } = await comunidade(0);
      const { assentos, provedor } = montar();

      const visao = await assentos.checkout(dona, groupId, { seats: 3, taxId: CNPJ });

      expect(provedor.ensureGroupCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ groupId, taxId: '11222333000181' }),
      );
      expect(provedor.createSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          valueCents: 3 * 1490,
          cycle: 'MONTHLY',
          externalReference: `group:${groupId}`,
        }),
      );
      expect(visao.pool).toMatchObject({ seats: 3, status: 'PENDING', monthlyCents: 4470 });
      expect(visao.pool?.paymentUrl).toMatch(/^https:\/\/sandbox\.asaas\.com\/i\//);

      const pool = await prisma.groupSeatPool.findUniqueOrThrow({ where: { groupId } });
      expect(JSON.stringify(pool)).not.toContain('11222333000181');
    });

    it('repetir com o mesmo número devolve o mesmo link; outro número troca o checkout', async () => {
      const { dona, groupId } = await comunidade(0);
      const { assentos, provedor } = montar();

      const a = await assentos.checkout(dona, groupId, { seats: 2, taxId: CNPJ });
      const b = await assentos.checkout(dona, groupId, { seats: 2, taxId: CNPJ });
      expect(b.pool?.paymentUrl).toBe(a.pool?.paymentUrl);
      expect(provedor.createSubscription).toHaveBeenCalledTimes(1);

      const c = await assentos.checkout(dona, groupId, { seats: 4, taxId: CNPJ });
      expect(c.pool).toMatchObject({ seats: 4, status: 'PENDING' });
      expect(provedor.cancelSubscription).toHaveBeenCalledTimes(1);
    });

    it('documento inválido é 400; comunidade com assentos ativos é 409', async () => {
      const { dona, groupId, assentos } = await comunidadePaga(2, 0);
      await expect(
        assentos.checkout(dona, groupId, { seats: 1, taxId: '11.222.333/0001-80' }),
      ).rejects.toThrow(BadRequestException);
      await expect(assentos.checkout(dona, groupId, { seats: 1, taxId: CNPJ })).rejects.toThrow(
        ConflictException,
      );
    });

    it('sem Asaas configurado a compra responde 503', async () => {
      const { dona, groupId } = await comunidade(0);
      const semProvedor = new SeatPoolService(prisma, config, null);
      await expect(semProvedor.checkout(dona, groupId, { seats: 1, taxId: CNPJ })).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('webhook da assinatura dos assentos', () => {
    it('a primeira confirmação ativa o pool; o evento repetido é no-op', async () => {
      const { dona, groupId } = await comunidade(0);
      const { assentos, assinaturas } = montar();
      await assentos.checkout(dona, groupId, { seats: 1, taxId: CNPJ });
      const { providerRef } = await prisma.groupSeatPool.findUniqueOrThrow({ where: { groupId } });

      const evento = pagamento('PAYMENT_CONFIRMED', {
        subscription: providerRef as string,
        dueDate: diaIso(0),
      });
      expect(await webhook(assinaturas, evento)).toEqual({ received: true });
      expect(await webhook(assinaturas, evento)).toEqual({ received: true, duplicate: true });

      const pool = await prisma.groupSeatPool.findUniqueOrThrow({ where: { groupId } });
      expect(pool.status).toBe('ACTIVE');
      expect(pool.paymentUrl).toBeNull();
      expect(pool.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now());
      const registro = await prisma.billingWebhookEvent.findUniqueOrThrow({
        where: { provider_eventId: { provider: 'asaas', eventId: evento.id } },
      });
      expect(registro.error).toBeNull();
    });

    it('evento de assinatura que não é nossa continua desconhecido', async () => {
      const { assinaturas } = montar();
      expect(
        await webhook(
          assinaturas,
          pagamento('PAYMENT_CONFIRMED', { subscription: 'sub_de_ninguem', dueDate: diaIso(0) }),
        ),
      ).toEqual({ received: true, ignored: 'assinatura_desconhecida' });
    });
  });

  describe('histórico de faturas', () => {
    it('cada cobrança vira uma linha, atualizada pelos eventos dela; paga não volta a vencida', async () => {
      const { groupId, providerRef, assinaturas, assentos } = await comunidadePaga(2);
      const id = `pay_fatura_${Date.now()}`;
      const ev = (event: string) =>
        webhook(
          assinaturas,
          pagamento(event, {
            id,
            subscription: providerRef,
            dueDate: diaIso(20),
            value: 29.8,
            invoiceUrl: `https://sandbox.asaas.com/i/${id}`,
          }),
        );

      await ev('PAYMENT_CREATED');
      await ev('PAYMENT_OVERDUE');
      expect(
        (await assentos.invoices(groupId)).find((f) => f.id && f.amountCents === 2980),
      ).toMatchObject({ kind: 'SUBSCRIPTION', status: 'OVERDUE', paidAt: null });

      await ev('PAYMENT_RECEIVED');
      await ev('PAYMENT_OVERDUE');
      const paga = await prisma.groupSeatInvoice.findUniqueOrThrow({
        where: { providerPaymentId: id },
      });
      expect(paga).toMatchObject({
        status: 'PAID',
        amountCents: 2980,
        dueDate: diaIso(20),
        invoiceUrl: `https://sandbox.asaas.com/i/${id}`,
      });
      expect(paga.paidAt).not.toBeNull();

      await ev('PAYMENT_REFUNDED');
      expect(
        (await prisma.groupSeatInvoice.findUniqueOrThrow({ where: { providerPaymentId: id } }))
          .status,
      ).toBe('VOID');
      expect(await prisma.groupSeatInvoice.count({ where: { providerPaymentId: id } })).toBe(1);
    });

    it('o proporcional entra como avulso; link que não é https não é guardado', async () => {
      const { dona, groupId, assentos, assinaturas } = await comunidadePaga(1);
      await assentos.changeSeats(dona, groupId, 2);
      const { providerChargeId } = await prisma.groupSeatAdjustment.findFirstOrThrow({
        where: { pool: { groupId } },
      });
      await webhook(
        assinaturas,
        pagamento('PAYMENT_RECEIVED', {
          id: providerChargeId as string,
          dueDate: diaIso(0),
          value: 9.93,
          invoiceUrl: 'javascript:alert(1)',
        }),
      );
      const faturas = await assentos.invoices(groupId);
      expect(faturas.find((f) => f.kind === 'ADJUSTMENT')).toMatchObject({
        amountCents: 993,
        status: 'PAID',
        invoiceUrl: null,
      });
    });

    it('cada comunidade vê só as próprias faturas', async () => {
      const a = await comunidadePaga(1);
      const b = await comunidadePaga(1);
      const id = `pay_iso_${Date.now()}`;
      await webhook(
        a.assinaturas,
        pagamento('PAYMENT_RECEIVED', {
          id,
          subscription: a.providerRef,
          dueDate: diaIso(30),
          value: 14.9,
        }),
      );
      expect((await a.assentos.invoices(a.groupId)).map((f) => f.amountCents)).toContain(1490);
      expect(await b.assentos.invoices(b.groupId)).toEqual([]);
    });
  });

  describe('atribuição e direito à IA', () => {
    it('membro com assento vira PRO pela comunidade; sem assento continua Free', async () => {
      const { dona, groupId, membros, assentos, direitos } = await comunidadePaga(1);

      const visao = await assentos.assign(dona, groupId, membros[0].membershipId);
      expect(visao.assigned).toBe(1);
      expect(visao.assignments[0]).toMatchObject({ name: 'Membro 1', ownPro: false });

      expect(await direitos.aiTierForUser(membros[0].userId)).toMatchObject({
        tier: 'PRO',
        source: 'GROUP',
        subscription: { group: { id: groupId } },
      });
      expect(await direitos.aiTierForUser(membros[1].userId)).toMatchObject({ tier: 'FREE' });
    });

    it('atribuir de novo é idempotente; passar do total é 409', async () => {
      const { dona, groupId, membros, assentos } = await comunidadePaga(1);
      await assentos.assign(dona, groupId, membros[0].membershipId);
      expect((await assentos.assign(dona, groupId, membros[0].membershipId)).assigned).toBe(1);
      await expect(assentos.assign(dona, groupId, membros[1].membershipId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('antes do primeiro pagamento não há o que atribuir', async () => {
      const { dona, groupId, membros } = await comunidade(1);
      const { assentos } = montar();
      await assentos.checkout(dona, groupId, { seats: 1, taxId: CNPJ });
      await expect(assentos.assign(dona, groupId, membros[0].membershipId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('quem saiu da comunidade perde o PRO, mesmo com a atribuição aberta', async () => {
      const { dona, groupId, membros, assentos, direitos } = await comunidadePaga(1);
      await assentos.assign(dona, groupId, membros[0].membershipId);
      await prisma.groupMembership.update({
        where: { id: membros[0].membershipId },
        data: { status: 'LEFT', leftAt: new Date() },
      });
      expect(await direitos.aiTierForUser(membros[0].userId)).toMatchObject({ tier: 'FREE' });
    });

    it('retirar o assento devolve ao Free; retirar de quem não tem é 404', async () => {
      const { dona, groupId, membros, assentos, direitos } = await comunidadePaga(1);
      await assentos.assign(dona, groupId, membros[0].membershipId);
      await assentos.unassign(dona, groupId, membros[0].membershipId);
      expect(await direitos.aiTierForUser(membros[0].userId)).toMatchObject({ tier: 'FREE' });
      await expect(assentos.unassign(dona, groupId, membros[0].membershipId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('quem já paga o próprio PRO fica com o próprio, e a equipe vê isso', async () => {
      const { dona, groupId, membros, assentos, direitos } = await comunidadePaga(1);
      await prisma.userSubscription.create({
        data: {
          userId: membros[0].userId,
          source: 'MANUAL',
          status: 'ACTIVE',
          currentPeriodEnd: new Date(Date.now() + 5 * DIA),
        },
      });
      const visao = await assentos.assign(dona, groupId, membros[0].membershipId);
      expect(visao.assignments[0].ownPro).toBe(true);
      expect(await direitos.aiTierForUser(membros[0].userId)).toMatchObject({ source: 'MANUAL' });
    });

    it('a comunidade paga o uso de quem usa o assento', async () => {
      const { dona, groupId, membros, assentos, assinaturas } = await comunidadePaga(1);
      await assentos.assign(dona, groupId, membros[0].membershipId);
      expect(await assinaturas.plano(membros[0].userId)).toMatchObject({
        tier: 'PRO',
        source: 'GROUP',
        groupName: expect.stringMatching(/^Academia /),
        paymentUrl: null,
        manageUrl: null,
      });
      await expect(assinaturas.cancelar(membros[0].userId)).rejects.toThrow(ConflictException);
    });
  });

  describe('quem gerencia os assentos (o service é a porta que vale)', () => {
    it('membro comum recebe 403 e quem é de fora 404, sem passar pela rota', async () => {
      // O papel era conferido só pelo GroupRoleGuard da rota. Chamado de outro
      // lugar, o service deixava um membro dar assento a si mesmo.
      const { groupId, membros, assentos } = await comunidadePaga(2);
      const membro = membros[0];
      const estranho = await pessoa('Estranho');

      const acoes = (quem: string) => [
        assentos.assign(quem, groupId, membro.membershipId),
        assentos.unassign(quem, groupId, membro.membershipId),
        assentos.changeSeats(quem, groupId, 3),
        assentos.cancel(quem, groupId),
        assentos.checkout(quem, groupId, { seats: 1, taxId: CNPJ }),
      ];
      for (const resultado of acoes(membro.userId)) {
        await expect(resultado).rejects.toThrow(ForbiddenException);
      }
      for (const resultado of acoes(estranho)) {
        await expect(resultado).rejects.toThrow(NotFoundException);
      }
      expect((await assentos.overview(groupId)).assigned).toBe(0);
      expect(await assentos.overview(groupId)).toMatchObject({
        pool: { seats: 2, status: 'ACTIVE' },
      });
    });
  });

  describe('isolamento entre comunidades', () => {
    it('não atribui nem retira assento de membro de outra comunidade', async () => {
      const a = await comunidadePaga(2);
      const b = await comunidadePaga(2);
      await a.assentos.assign(a.dona, a.groupId, a.membros[0].membershipId);

      await expect(a.assentos.assign(a.dona, a.groupId, b.membros[0].membershipId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        a.assentos.unassign(a.dona, b.groupId, a.membros[0].membershipId),
      ).rejects.toThrow(NotFoundException);
      expect(await a.direitos.aiTierForUser(a.membros[0].userId)).toMatchObject({ tier: 'PRO' });
      expect((await a.assentos.overview(b.groupId)).assigned).toBe(0);
    });

    it('membro ainda pendente de aprovação não recebe assento', async () => {
      const { dona, groupId, assentos } = await comunidadePaga(1, 0);
      const userId = await pessoa('Pendente');
      const m = await prisma.groupMembership.create({
        data: { groupId, userId, role: 'MEMBER', status: 'INVITED' },
      });
      await expect(assentos.assign(dona, groupId, m.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('mudar a quantidade', () => {
    it('aumento vale na hora: recorrente no valor novo e pró-rata avulso', async () => {
      const { dona, groupId, providerRef, assentos, provedor } = await comunidadePaga(2);

      const visao = await assentos.changeSeats(dona, groupId, 5);

      expect(visao.pool).toMatchObject({ seats: 5, monthlyCents: 5 * 1490 });
      expect(provedor.updateSubscriptionValue).toHaveBeenCalledWith(providerRef, 5 * 1490);
      expect(provedor.createSubscriptionCharge).toHaveBeenCalledTimes(1);
      const cobranca = provedor.createSubscriptionCharge.mock.calls[0] as unknown as [
        { amountCents: number; externalReference: string },
      ];
      // 3 novos × R$ 14,90 por uns 20 de ~30 dias: entre R$ 25 e R$ 35.
      expect(cobranca[0].amountCents).toBeGreaterThan(2500);
      expect(cobranca[0].amountCents).toBeLessThan(3500);

      const ajuste = await prisma.groupSeatAdjustment.findFirstOrThrow({
        where: { pool: { groupId } },
      });
      expect(cobranca[0].externalReference).toBe(`seat-adjustment:${ajuste.id}`);
      expect(ajuste).toMatchObject({ fromSeats: 2, toSeats: 5, status: 'PENDING' });
      expect(visao.pendingCharges).toHaveLength(1);
    });

    it('cobrança avulsa que falha desfaz o aumento', async () => {
      const { dona, groupId, providerRef, assentos, provedor } = await comunidadePaga(2);
      provedor.createSubscriptionCharge.mockRejectedValueOnce(new Error('asaas fora'));

      await expect(assentos.changeSeats(dona, groupId, 4)).rejects.toThrow(BadGatewayException);
      expect(provedor.updateSubscriptionValue).toHaveBeenLastCalledWith(providerRef, 2 * 1490);
      const pool = await prisma.groupSeatPool.findUniqueOrThrow({ where: { groupId } });
      expect(pool.seats).toBe(2);
    });

    it('pró-rata vencido põe a comunidade em atraso com carência; pago, volta ao normal', async () => {
      const { groupId, assentos, provedor, assinaturas, direitos, dona, membros } =
        await comunidadePaga(1);
      await assentos.assign(dona, groupId, membros[0].membershipId);
      await assentos.changeSeats(dona, groupId, 3);
      const { providerChargeId } = await prisma.groupSeatAdjustment.findFirstOrThrow({
        where: { pool: { groupId } },
      });
      expect(provedor.createSubscriptionCharge).toHaveBeenCalled();

      await webhook(
        assinaturas,
        pagamento('PAYMENT_OVERDUE', { id: providerChargeId as string, dueDate: diaIso(-1) }),
      );
      let pool = await prisma.groupSeatPool.findUniqueOrThrow({ where: { groupId } });
      expect(pool.status).toBe('PAST_DUE');
      expect(pool.graceEndsAt!.getTime()).toBeGreaterThan(Date.now());
      // Dentro da carência o assento continua valendo.
      expect(await direitos.aiTierForUser(membros[0].userId)).toMatchObject({
        tier: 'PRO',
        motivo: 'carencia',
      });

      await webhook(
        assinaturas,
        pagamento('PAYMENT_RECEIVED', { id: providerChargeId as string, dueDate: diaIso(-1) }),
      );
      pool = await prisma.groupSeatPool.findUniqueOrThrow({ where: { groupId } });
      expect(pool).toMatchObject({ status: 'ACTIVE', graceEndsAt: null });
      const ajuste = await prisma.groupSeatAdjustment.findFirstOrThrow({
        where: { pool: { groupId } },
      });
      expect(ajuste.status).toBe('ACTIVE');
    });

    it('redução abaixo dos atribuídos é 409; acima vale na renovação', async () => {
      const { dona, groupId, membros, providerRef, assentos, assinaturas, provedor } =
        await comunidadePaga(3, 2);
      await assentos.assign(dona, groupId, membros[0].membershipId);
      await assentos.assign(dona, groupId, membros[1].membershipId);

      await expect(assentos.changeSeats(dona, groupId, 1)).rejects.toThrow(ConflictException);

      const visao = await assentos.changeSeats(dona, groupId, 2);
      expect(visao.pool).toMatchObject({ seats: 3, nextPeriodSeats: 2, nextMonthlyCents: 2980 });
      expect(provedor.updateSubscriptionValue).toHaveBeenLastCalledWith(providerRef, 2980);
      expect(provedor.createSubscriptionCharge).not.toHaveBeenCalled();

      const antes = await prisma.groupSeatPool.findUniqueOrThrow({ where: { groupId } });
      const proximoVencimento = antes.currentPeriodEnd!.toISOString().slice(0, 10);
      await webhook(
        assinaturas,
        pagamento('PAYMENT_CONFIRMED', { subscription: providerRef, dueDate: proximoVencimento }),
      );
      const depois = await prisma.groupSeatPool.findUniqueOrThrow({ where: { groupId } });
      expect(depois).toMatchObject({ seats: 2, nextPeriodSeats: null });
      expect((await assentos.overview(groupId)).assigned).toBe(2);
    });

    it('aumento com a comunidade em atraso é 409', async () => {
      const { dona, groupId, assentos } = await comunidadePaga(1);
      await prisma.groupSeatPool.update({
        where: { groupId },
        data: { status: 'PAST_DUE', graceEndsAt: new Date(Date.now() + DIA) },
      });
      await expect(assentos.changeSeats(dona, groupId, 2)).rejects.toThrow(ConflictException);
    });
  });

  describe('cancelar e apagar', () => {
    it('cancelar mantém os assentos até o fim do período pago', async () => {
      const { dona, groupId, membros, providerRef, assentos, provedor, direitos } =
        await comunidadePaga(1);
      await assentos.assign(dona, groupId, membros[0].membershipId);

      const visao = await assentos.cancel(dona, groupId);
      expect(provedor.cancelSubscription).toHaveBeenCalledWith(providerRef);
      expect(visao.pool).toMatchObject({ status: 'ACTIVE', cancelAtPeriodEnd: true });
      expect(await direitos.aiTierForUser(membros[0].userId)).toMatchObject({ tier: 'PRO' });
    });

    it('apagar a conta da dona cancela os assentos das comunidades dela; falha do provedor aborta', async () => {
      const { dona, providerRef, assentos, provedor } = await comunidadePaga(1, 0);

      await assentos.encerrarAntesDeApagarConta(dona);
      expect(provedor.cancelSubscription).toHaveBeenCalledWith(providerRef);

      provedor.cancelSubscription.mockRejectedValueOnce(new Error('asaas fora'));
      await expect(assentos.encerrarAntesDeApagarConta(dona)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('apagar a comunidade cancela só os assentos dela', async () => {
      const a = await comunidadePaga(1, 0);
      const b = await comunidadePaga(1, 0);
      await a.assentos.encerrarAntesDeApagarGrupo(a.groupId);
      expect(a.provedor.cancelSubscription).toHaveBeenCalledTimes(1);
      expect(a.provedor.cancelSubscription).toHaveBeenCalledWith(a.providerRef);
      expect(a.provedor.cancelSubscription).not.toHaveBeenCalledWith(b.providerRef);
    });
  });
});
