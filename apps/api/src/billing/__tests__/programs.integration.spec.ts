import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { AsaasProvider } from '../asaas/asaas.provider';
import type { SeatProvider, SubscriptionProvider } from '../billing-provider.port';
import { ProgramService } from '../program.service';
import { SeatPoolService } from '../seat-pool.service';
import { SubscriptionEntitlementsService } from '../subscription-entitlements.service';
import { UserSubscriptionService } from '../user-subscription.service';

/**
 * Assentos e faturas na tela nova (#403, Pn-07) e programas (PRO por período
 * para uma turma ou um desafio), contra o Postgres de teste. O provedor é
 * dublê nas chamadas que saem; o webhook usa a verificação de verdade.
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
      providerSubscriptionId: `sub_prog_${Date.now()}_${++n}`,
    })),
    firstPaymentUrl: jest.fn(async (id: string) => `https://sandbox.asaas.com/i/${id}`),
    cancelSubscription: jest.fn(async (_id: string) => undefined),
    updateSubscriptionValue: jest.fn(async (_id: string, _v: number) => undefined),
    createSubscriptionCharge: jest.fn(async () => ({
      providerChargeId: `pay_prog_${Date.now()}_${++n}`,
      url: 'https://sandbox.asaas.com/i/prog',
    })),
    verifySubscriptionWebhook: real.verifySubscriptionWebhook.bind(real),
  } satisfies SeatProvider & SubscriptionProvider;
}

function montar() {
  const provedor = provedorFalso();
  const direitos = new SubscriptionEntitlementsService(prisma, config);
  const assentos = new SeatPoolService(prisma, config, provedor);
  const assinaturas = new UserSubscriptionService(prisma, config, direitos, provedor, assentos);
  const programas = new ProgramService(prisma, config, provedor);
  return { provedor, direitos, assentos, assinaturas, programas };
}

const webhook = (s: UserSubscriptionService, corpo: object) =>
  s.handleAsaasWebhook({ 'asaas-access-token': TOKEN }, JSON.stringify(corpo));

let ev = 0;
const pagamento = (
  event: string,
  extra: { subscription?: string; id?: string; dueDate: string; value?: number },
) => ({
  id: `evt_prog_${Date.now()}_${++ev}`,
  event,
  payment: { id: extra.id ?? `pay_${Date.now()}_${ev}`, status: 'CONFIRMED', ...extra },
});

const diaIso = (n: number) => new Date(Date.now() + n * DIA).toISOString().slice(0, 10);

describe('assentos, faturas e programas (#403, banco real)', () => {
  const stamp = `programas-${Date.now()}`;
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

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.$disconnect();
  });

  describe('visão dos assentos (Pn-07)', () => {
    it('próxima fatura = assentos × preço da configuração, com o vencimento do período', async () => {
      const { groupId, assentos } = await comunidadePaga(4, 0);
      const v = await assentos.overview(groupId);
      const pool = await prisma.groupSeatPool.findUniqueOrThrow({ where: { groupId } });
      expect(v.unitPriceCents).toBe(1490);
      expect(v.nextInvoice).toEqual({
        seats: 4,
        unitPriceCents: 1490,
        amountCents: 4 * 1490,
        dueAt: pool.currentPeriodEnd!.toISOString(),
      });
      expect(v.pool?.graceDaysLeft).toBeNull();
      expect(v.overdueInvoice).toBeNull();
    });

    it('vencida: dias restantes da carência pelo graceEndsAt e a fatura para pagar', async () => {
      const { groupId, providerRef, assentos, assinaturas } = await comunidadePaga(2, 0);
      const id = `pay_venc_${Date.now()}`;
      await webhook(
        assinaturas,
        pagamento('PAYMENT_OVERDUE', {
          id,
          subscription: providerRef,
          dueDate: diaIso(-4),
          value: 29.8,
        }),
      );
      await prisma.groupSeatInvoice.update({
        where: { providerPaymentId: id },
        data: { invoiceUrl: 'https://sandbox.asaas.com/i/venc' },
      });
      const v = await assentos.overview(groupId);
      expect(v.pool?.status).toBe('PAST_DUE');
      // Venceu há 4 dias, carência de 7: faltam 3.
      expect(v.pool?.graceDaysLeft).toBe(3);
      expect(v.overdueInvoice).toMatchObject({
        amountCents: 2980,
        invoiceUrl: 'https://sandbox.asaas.com/i/venc',
      });
      // A fatura sai com os assentos que ela cobra.
      const [f] = await assentos.invoices(groupId);
      expect(f).toMatchObject({ kind: 'SUBSCRIPTION', seats: 2, status: 'OVERDUE' });
    });

    it('o ajuste guarda os dias proporcionais e a fatura de ajuste sai com os assentos novos', async () => {
      const { dona, groupId, assentos, assinaturas } = await comunidadePaga(2, 0);
      await assentos.changeSeats(dona, groupId, 12);
      const ajuste = await prisma.groupSeatAdjustment.findFirstOrThrow({
        where: { pool: { groupId } },
      });
      expect(ajuste.proRataDays).toBeGreaterThan(0);
      await webhook(
        assinaturas,
        pagamento('PAYMENT_CREATED', {
          id: ajuste.providerChargeId!,
          dueDate: diaIso(1),
          value: ajuste.amountCents / 100,
        }),
      );
      const f = (await assentos.invoices(groupId)).find((i) => i.kind === 'ADJUSTMENT');
      expect(f).toMatchObject({ seats: 10, proRataDays: ajuste.proRataDays });
    });
  });

  describe('programas', () => {
    it('turma: assentos à parte do pool, cobrança avulsa de assentos × preço por mês', async () => {
      const c = await comunidadePaga(1, 3);
      await c.assentos.assign(c.dona, c.groupId, c.membros[0]!.membershipId);
      const p = await c.programas.create(c.dona, c.groupId, {
        name: 'Verão 21',
        note: 'turma das 6h',
        kind: 'CLASS',
        seats: 2,
        startDate: diaIso(0),
        endDate: diaIso(29),
        membershipIds: [c.membros[1]!.membershipId, c.membros[2]!.membershipId],
      });
      expect(p).toMatchObject({
        name: 'Verão 21',
        kind: 'CLASS',
        seats: 2,
        assigned: 2,
        amountCents: 2 * 1490,
        status: 'ACTIVE',
        chargeStatus: 'PENDING',
      });
      expect(c.provedor.createSubscriptionCharge).toHaveBeenCalledWith(
        expect.objectContaining({
          providerSubscriptionId: c.providerRef,
          amountCents: 2980,
          externalReference: `group-program:${p.id}`,
        }),
      );
      // O pool continua com 1 de 1 em uso: o programa não come assento dele.
      const v = await c.assentos.overview(c.groupId);
      expect(v.assigned).toBe(1);
      expect(v.programs.map((x) => x.id)).toEqual([p.id]);
      expect(await c.direitos.aiTierForUser(c.membros[1]!.userId)).toMatchObject({
        tier: 'PRO',
        subscription: { paidBy: 'PROGRAM', programName: 'Verão 21' },
      });
    });

    it('mais de 31 dias cobra por mês começado; agendado não dá PRO antes do começo', async () => {
      const c = await comunidadePaga(1, 1);
      const p = await c.programas.create(c.dona, c.groupId, {
        name: 'Desafio longo',
        kind: 'CLASS',
        seats: 3,
        startDate: diaIso(5),
        endDate: diaIso(44),
        membershipIds: [c.membros[0]!.membershipId],
      });
      expect(p).toMatchObject({ amountCents: 3 * 1490 * 2, status: 'SCHEDULED', assigned: 1 });
      expect(await c.direitos.aiTierForUser(c.membros[0]!.userId)).toMatchObject({ tier: 'FREE' });
    });

    it('turma maior que os assentos é 409; membro de outra comunidade é 404', async () => {
      const c = await comunidadePaga(1, 2);
      const outra = await comunidade(1);
      const base = {
        name: 'X',
        kind: 'CLASS' as const,
        seats: 1,
        startDate: diaIso(0),
        endDate: diaIso(10),
      };
      await expect(
        c.programas.create(c.dona, c.groupId, {
          ...base,
          membershipIds: c.membros.map((m) => m.membershipId),
        }),
      ).rejects.toThrow(ConflictException);
      await expect(
        c.programas.create(c.dona, c.groupId, {
          ...base,
          membershipIds: [outra.membros[0]!.membershipId],
        }),
      ).rejects.toThrow(NotFoundException);
      expect(await prisma.groupProgram.count({ where: { groupId: c.groupId } })).toBe(0);
    });

    it('desafio: quem já entrou ganha o assento, quem entra depois também, até acabar', async () => {
      const c = await comunidadePaga(1, 3);
      const outra = await comunidade(0);
      const desafio = async (groupId: string) =>
        prisma.groupChallenge.create({
          data: {
            groupId,
            title: '10 mil passos',
            metric: 'STEPS',
            startsAt: new Date(Date.now() - DIA),
            endsAt: new Date(Date.now() + 20 * DIA),
            timezone: 'America/Sao_Paulo',
          },
        });
      const d = await desafio(c.groupId);
      const alheio = await desafio(outra.groupId);
      await prisma.groupChallengeParticipant.create({
        data: { challengeId: d.id, membershipId: c.membros[0]!.membershipId, displayName: 'A' },
      });
      const base = {
        name: 'Desafio de dezembro',
        kind: 'CHALLENGE' as const,
        seats: 2,
        startDate: diaIso(0),
        endDate: diaIso(20),
      };
      // Desafio de outra comunidade: 404, sem criar nada.
      await expect(
        c.programas.create(c.dona, c.groupId, { ...base, challengeId: alheio.id }),
      ).rejects.toThrow(NotFoundException);

      const p = await c.programas.create(c.dona, c.groupId, { ...base, challengeId: d.id });
      expect(p).toMatchObject({ assigned: 1, challengeTitle: '10 mil passos' });

      for (const m of c.membros.slice(1)) {
        await prisma.groupChallengeParticipant.create({
          data: { challengeId: d.id, membershipId: m.membershipId, displayName: 'B' },
        });
        await c.programas.syncChallenge(d.id);
      }
      const [atual] = await c.programas.list(c.groupId);
      expect(atual).toMatchObject({ seats: 2, assigned: 2 });
      expect(await c.direitos.aiTierForUser(c.membros[2]!.userId)).toMatchObject({ tier: 'FREE' });
    });

    it('cobrança do programa vencida põe a comunidade na carência; a fatura sai como programa', async () => {
      const c = await comunidadePaga(1, 1);
      const p = await c.programas.create(c.dona, c.groupId, {
        name: 'Turma',
        kind: 'CLASS',
        seats: 1,
        startDate: diaIso(0),
        endDate: diaIso(10),
        membershipIds: [c.membros[0]!.membershipId],
      });
      const prog = await prisma.groupProgram.findUniqueOrThrow({ where: { id: p.id } });
      await webhook(
        c.assinaturas,
        pagamento('PAYMENT_OVERDUE', {
          id: prog.providerChargeId!,
          dueDate: diaIso(-1),
          value: 14.9,
        }),
      );
      const pool = await prisma.groupSeatPool.findUniqueOrThrow({ where: { groupId: c.groupId } });
      expect(pool.status).toBe('PAST_DUE');
      expect(pool.graceEndsAt!.getTime()).toBeGreaterThan(Date.now());
      expect((await c.programas.list(c.groupId))[0]).toMatchObject({ chargeStatus: 'PAST_DUE' });
      const f = (await c.assentos.invoices(c.groupId)).find((i) => i.kind === 'PROGRAM');
      expect(f).toMatchObject({ seats: 1, status: 'OVERDUE' });
      // Dentro da carência ninguém perde nada.
      expect(await c.direitos.aiTierForUser(c.membros[0]!.userId)).toMatchObject({ tier: 'PRO' });

      await webhook(
        c.assinaturas,
        pagamento('PAYMENT_RECEIVED', {
          id: prog.providerChargeId!,
          dueDate: diaIso(-1),
          value: 14.9,
        }),
      );
      expect(
        (await prisma.groupSeatPool.findUniqueOrThrow({ where: { groupId: c.groupId } })).status,
      ).toBe('ACTIVE');
    });

    it('só o dono cria programa', async () => {
      const c = await comunidadePaga(1, 1);
      const adminId = await pessoa('Admin');
      await prisma.groupMembership.create({
        data: { groupId: c.groupId, userId: adminId, role: 'ADMIN', status: 'ACTIVE' },
      });
      await expect(
        c.programas.create(adminId, c.groupId, {
          name: 'X',
          kind: 'CLASS',
          seats: 1,
          startDate: diaIso(0),
          endDate: diaIso(3),
          membershipIds: [],
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
