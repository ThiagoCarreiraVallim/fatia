import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type GroupSeatPool, type SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { addDaysIso, dayBoundsInTz } from '../progress/helpers/date-tz';
import { CARENCIA_DIAS, resolverDireitoIa } from './ai-entitlement';
import type { ResultadoDeWebhookDeAssinatura, SeatProvider } from './billing-provider.port';
import { documentoValido, somenteDigitos } from './cpf';
import {
  ASSENTOS_MAX,
  FUSO_DO_PROVEDOR,
  proRataAumento,
  valorMensal,
  vencimentoAvulso,
} from './seat-pricing';
import { ASSINATURA_LIDA } from './subscription-entitlements.service';
import { mudancaDoEvento } from './subscription-events';

/** Token do provedor de assentos. `null` = instância sem Asaas configurado. */
export const SEAT_PROVIDER = Symbol('SEAT_PROVIDER');

/** Link de pagamento ainda vale para reabrir o mesmo checkout. */
const CHECKOUT_REUSAVEL_MS = 24 * 60 * 60 * 1000;
/** Pool que ainda dá (ou pode voltar a dar) assento. */
const VIVOS: SubscriptionStatus[] = ['PENDING', 'ACTIVE', 'PAST_DUE'];
/** Pool em que se atribui assento: já pago, ou em atraso dentro da carência. */
const ATRIBUIVEIS: SubscriptionStatus[] = ['ACTIVE', 'PAST_DUE'];

const SEM_ASSENTOS = 'Esta comunidade não tem assentos ativos.';

export interface VisaoDosAssentos {
  groupId: string;
  unitPriceCents: number;
  /** Compra pela web disponível (Asaas configurado). */
  webCheckout: boolean;
  pool: {
    seats: number;
    /** Redução pedida, que vale na renovação. */
    nextPeriodSeats: number | null;
    status: SubscriptionStatus;
    /** Cortesia sem cobrança (script de dev), sem link de pagamento. */
    manual: boolean;
    currentPeriodEnd: string | null;
    graceEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
    paymentUrl: string | null;
    monthlyCents: number;
    nextMonthlyCents: number;
  } | null;
  assigned: number;
  assignments: Array<{
    membershipId: string;
    name: string;
    assignedAt: string;
    /** A pessoa já paga o próprio PRO: o assento fica sem uso enquanto isso. */
    ownPro: boolean;
  }>;
  /** Cobranças avulsas de aumento ainda em aberto. */
  pendingCharges: Array<{
    id: string;
    fromSeats: number;
    toSeats: number;
    amountCents: number;
    status: SubscriptionStatus;
    createdAt: string;
  }>;
}

/**
 * Assentos de IA pagos pela comunidade (ADR 025): uma assinatura mensal por
 * comunidade no Asaas, `seats × preço`, e o dono escolhe quem usa.
 *
 * A permissão (`billing.read`/`billing.manage`, só o dono) é do guarda na
 * rota; aqui ficam as regras de dinheiro e de consistência, e o isolamento
 * pela comunidade em toda consulta (`groupId` sempre no filtro).
 */
@Injectable()
export class SeatPoolService {
  private readonly logger = new Logger(SeatPoolService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(SEAT_PROVIDER) private readonly provedor: SeatProvider | null,
  ) {}

  precoUnitario(): number {
    return this.config.get<number>('BILLING_SEAT_MONTHLY_CENTS', 1490);
  }

  async overview(groupId: string, agora: Date = new Date()): Promise<VisaoDosAssentos> {
    const pool = await this.prisma.groupSeatPool.findUnique({
      where: { groupId },
      include: {
        assignments: {
          where: { revokedAt: null },
          orderBy: { assignedAt: 'asc' },
          select: {
            assignedAt: true,
            membership: {
              select: { id: true, userId: true, user: { select: { name: true } } },
            },
          },
        },
        adjustments: {
          where: { status: { in: ['PENDING', 'PAST_DUE'] } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const unit = pool?.unitPriceCents ?? this.precoUnitario();
    const userIds = pool?.assignments.map((a) => a.membership.userId) ?? [];
    const proprias = userIds.length
      ? await this.prisma.userSubscription.findMany({
          where: { userId: { in: userIds } },
          select: { ...ASSINATURA_LIDA, userId: true },
        })
      : [];
    const temProProprio = (userId: string) =>
      resolverDireitoIa(
        proprias.filter((s) => s.userId === userId),
        agora,
      ).tier === 'PRO';

    return {
      groupId,
      unitPriceCents: unit,
      webCheckout: this.provedor !== null,
      pool: pool
        ? {
            seats: pool.seats,
            nextPeriodSeats: pool.nextPeriodSeats,
            status: pool.status,
            manual: pool.providerRef === null,
            currentPeriodEnd: pool.currentPeriodEnd?.toISOString() ?? null,
            graceEndsAt: pool.graceEndsAt?.toISOString() ?? null,
            cancelAtPeriodEnd: pool.cancelAtPeriodEnd,
            paymentUrl: pool.status === 'PENDING' ? pool.paymentUrl : null,
            monthlyCents: valorMensal(pool.seats, unit),
            nextMonthlyCents: valorMensal(pool.nextPeriodSeats ?? pool.seats, unit),
          }
        : null,
      assigned: pool?.assignments.length ?? 0,
      assignments: (pool?.assignments ?? []).map((a) => ({
        membershipId: a.membership.id,
        name: a.membership.user.name,
        assignedAt: a.assignedAt.toISOString(),
        ownPro: temProProprio(a.membership.userId),
      })),
      pendingCharges: (pool?.adjustments ?? []).map((a) => ({
        id: a.id,
        fromSeats: a.fromSeats,
        toSeats: a.toSeats,
        amountCents: a.amountCents,
        status: a.status,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Abre (ou reabre) a compra dos assentos: assinatura mensal no Asaas, com o
   * link da primeira cobrança. Idempotente como o checkout pessoal: repetir
   * com o mesmo número devolve o mesmo link.
   *
   * O CPF/CNPJ vai ao Asaas uma vez e não é guardado.
   */
  async checkout(
    actorId: string,
    groupId: string,
    entrada: { seats: number; taxId: string },
  ): Promise<VisaoDosAssentos> {
    validarAssentos(entrada.seats);
    if (!documentoValido(entrada.taxId)) {
      throw new BadRequestException('CPF ou CNPJ inválido. Confira os números e tente de novo.');
    }
    const provedor = this.exigirProvedor();

    const atual = await this.prisma.groupSeatPool.findUnique({ where: { groupId } });
    if (atual && (atual.status === 'ACTIVE' || atual.status === 'PAST_DUE')) {
      throw new ConflictException(
        'Esta comunidade já tem assentos. Para mudar a quantidade, ajuste o número de assentos.',
      );
    }
    if (
      atual?.status === 'PENDING' &&
      atual.seats === entrada.seats &&
      atual.paymentUrl &&
      Date.now() - atual.updatedAt.getTime() < CHECKOUT_REUSAVEL_MS
    ) {
      return this.overview(groupId);
    }
    if (atual?.status === 'PENDING' && atual.providerRef) {
      await provedor.cancelSubscription(atual.providerRef).catch((err: Error) => {
        this.logger.warn({ event: 'checkout_de_assentos_antigo', groupId, err: err.name });
      });
    }

    const [grupo, dono] = await Promise.all([
      this.prisma.group.findUniqueOrThrow({ where: { id: groupId }, select: { name: true } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { email: true } }),
    ]);
    const unit = this.precoUnitario();
    const { providerCustomerId } = await provedor.ensureGroupCustomer({
      groupId,
      name: grupo.name,
      email: dono.email,
      taxId: somenteDigitos(entrada.taxId),
    });
    const { providerSubscriptionId } = await provedor.createSubscription({
      providerCustomerId,
      valueCents: valorMensal(entrada.seats, unit),
      cycle: 'MONTHLY',
      nextDueAt: new Date(),
      // Contagem e comunidade, nunca nome de membro: a descrição viaja por
      // e-mail, SMS e app do banco.
      description: `Fatia PRO — ${rotuloAssentos(entrada.seats)} da comunidade ${grupo.name}`,
      externalReference: `group:${groupId}`,
    });
    const paymentUrl = await provedor.firstPaymentUrl(providerSubscriptionId);

    const dados = {
      seats: entrada.seats,
      nextPeriodSeats: null,
      unitPriceCents: unit,
      status: 'PENDING' as const,
      providerRef: providerSubscriptionId,
      currentPeriodEnd: null,
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      paymentUrl,
      createdById: actorId,
    };
    const agora = new Date();
    await this.prisma.$transaction([
      // Um pool encerrado volta do zero: atribuições antigas não renascem.
      this.prisma.groupSeatAssignment.updateMany({
        where: { pool: { groupId }, revokedAt: null },
        data: { revokedAt: agora },
      }),
      this.prisma.groupSeatPool.upsert({
        where: { groupId },
        create: { groupId, ...dados },
        update: dados,
      }),
    ]);
    this.logger.log({ event: 'checkout_de_assentos', groupId, seats: entrada.seats });
    return this.overview(groupId);
  }

  /**
   * Muda o número de assentos.
   *
   * - **Aumento** vale na hora: a recorrente passa ao valor novo e a diferença
   *   até o fim do período sai numa cobrança avulsa proporcional (abaixo do
   *   mínimo do provedor, sem cobrança).
   * - **Redução** vale na renovação, e só se os atribuídos couberem (409).
   * - Antes de pagar (PENDING), só muda o valor da primeira cobrança.
   */
  async changeSeats(
    groupId: string,
    seats: number,
    agora: Date = new Date(),
  ): Promise<VisaoDosAssentos> {
    validarAssentos(seats);
    const pool = await this.poolVivo(groupId);
    const atribuidos = await this.contarAtribuidos(pool.id);
    const efetivo = pool.nextPeriodSeats ?? pool.seats;
    if (seats === efetivo) return this.overview(groupId);

    if (seats < atribuidos) {
      const sobra = atribuidos - seats;
      throw new ConflictException(
        `${atribuidos} assentos estão em uso. Retire ${sobra === 1 ? '1 assento' : `${sobra} assentos`} antes de reduzir.`,
      );
    }

    // Cortesia: sem dinheiro, vale na hora nos dois sentidos.
    if (!pool.providerRef) {
      await this.prisma.groupSeatPool.update({
        where: { id: pool.id },
        data: { seats, nextPeriodSeats: null },
      });
      return this.overview(groupId);
    }
    const provedor = this.exigirProvedor();

    if (pool.status === 'PENDING') {
      await provedor.updateSubscriptionValue(
        pool.providerRef,
        valorMensal(seats, pool.unitPriceCents),
      );
      await this.prisma.groupSeatPool.update({
        where: { id: pool.id },
        data: { seats, nextPeriodSeats: null },
      });
      return this.overview(groupId);
    }

    if (seats <= pool.seats) {
      // Redução (ou desfazer parte de uma redução): a cobrança pendente da
      // próxima renovação já sai com o valor novo.
      await provedor.updateSubscriptionValue(
        pool.providerRef,
        valorMensal(seats, pool.unitPriceCents),
      );
      await this.prisma.groupSeatPool.update({
        where: { id: pool.id },
        data: { nextPeriodSeats: seats === pool.seats ? null : seats },
      });
      this.logger.log({ event: 'reducao_de_assentos', groupId, de: pool.seats, para: seats });
      return this.overview(groupId);
    }

    if (pool.status === 'PAST_DUE') {
      throw new ConflictException(
        'O pagamento dos assentos está em atraso. Regularize antes de aumentar.',
      );
    }

    // Aumento: o valor da recorrente primeiro, depois o pró-rata.
    await provedor.updateSubscriptionValue(
      pool.providerRef,
      valorMensal(seats, pool.unitPriceCents),
    );
    const conta = pool.currentPeriodEnd
      ? proRataAumento({
          de: pool.seats,
          para: seats,
          unitCents: pool.unitPriceCents,
          fimDoPeriodo: pool.currentPeriodEnd,
          agora,
        })
      : null;

    const ajusteId = randomUUID();
    let cobranca: { providerChargeId: string } | null = null;
    if (conta?.cobrar) {
      try {
        cobranca = await provedor.createSubscriptionCharge({
          providerSubscriptionId: pool.providerRef,
          amountCents: conta.valorCents,
          dueDate: vencimentoAvulso(agora),
          description: `Fatia PRO — ${rotuloAssentos(seats - pool.seats)} a mais até o fim do mês`,
          externalReference: `seat-adjustment:${ajusteId}`,
        });
      } catch (err) {
        // Sem a cobrança, o aumento não vale: devolve o valor da recorrente.
        await provedor
          .updateSubscriptionValue(pool.providerRef, valorMensal(efetivo, pool.unitPriceCents))
          .catch(() => undefined);
        this.logger.error({
          event: 'cobranca_de_aumento_falhou',
          groupId,
          err: (err as Error).name,
        });
        throw new BadGatewayException(
          'Não conseguimos gerar a cobrança dos assentos novos. Tente de novo em alguns minutos.',
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.groupSeatPool.update({
        where: { id: pool.id },
        data: { seats, nextPeriodSeats: null },
      }),
      this.prisma.groupSeatAdjustment.create({
        data: {
          id: ajusteId,
          poolId: pool.id,
          fromSeats: pool.seats,
          toSeats: seats,
          amountCents: cobranca ? (conta?.valorCents ?? 0) : 0,
          providerChargeId: cobranca?.providerChargeId ?? null,
          // Sem cobrança (abaixo do mínimo ou sem período), não há o que pagar.
          status: cobranca ? 'PENDING' : 'ACTIVE',
        },
      }),
    ]);
    this.logger.log({
      event: 'aumento_de_assentos',
      groupId,
      de: pool.seats,
      para: seats,
      cobrado: conta?.cobrar ?? false,
    });
    return this.overview(groupId);
  }

  /** Dá um assento a um membro ACTIVE da comunidade. Idempotente. */
  async assign(actorId: string, groupId: string, membershipId: string): Promise<VisaoDosAssentos> {
    const pool = await this.poolVivo(groupId);
    if (!ATRIBUIVEIS.includes(pool.status)) {
      throw new ConflictException('Os assentos ficam disponíveis depois do primeiro pagamento.');
    }
    const membership = await this.prisma.groupMembership.findFirst({
      where: { id: membershipId, groupId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException('Membro não encontrado.');

    const jaTem = await this.prisma.groupSeatAssignment.findFirst({
      where: { poolId: pool.id, membershipId, revokedAt: null },
    });
    if (jaTem) return this.overview(groupId);

    if ((await this.contarAtribuidos(pool.id)) >= pool.seats) {
      throw new ConflictException(lotado(pool.seats));
    }

    let criado: { id: string };
    try {
      criado = await this.prisma.groupSeatAssignment.create({
        data: { poolId: pool.id, membershipId, assignedById: actorId },
        select: { id: true },
      });
    } catch (err) {
      // Índice único parcial: duas atribuições simultâneas ao mesmo membro.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.overview(groupId);
      }
      throw err;
    }
    // Duas atribuições simultâneas a pessoas diferentes podem passar da conta:
    // a que entrou por último sai.
    if ((await this.contarAtribuidos(pool.id)) > pool.seats) {
      await this.prisma.groupSeatAssignment.delete({ where: { id: criado.id } });
      throw new ConflictException(lotado(pool.seats));
    }
    return this.overview(groupId);
  }

  async unassign(groupId: string, membershipId: string): Promise<VisaoDosAssentos> {
    const { count } = await this.prisma.groupSeatAssignment.updateMany({
      where: { membershipId, revokedAt: null, pool: { groupId } },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Este membro não tem assento.');
    return this.overview(groupId);
  }

  /**
   * Encerra a recorrência. Assentos pagos valem até o fim do período;
   * checkout não pago fecha na hora; cortesia acaba na hora.
   */
  async cancel(groupId: string): Promise<VisaoDosAssentos> {
    const pool = await this.poolVivo(groupId);
    if (pool.providerRef) {
      if (pool.cancelAtPeriodEnd && pool.status !== 'PENDING') return this.overview(groupId);
      await this.exigirProvedor().cancelSubscription(pool.providerRef);
    }
    const agora = new Date();
    await this.prisma.groupSeatPool.update({
      where: { id: pool.id },
      data:
        pool.status === 'PENDING' || !pool.providerRef
          ? { status: 'CANCELED', canceledAt: agora, paymentUrl: null }
          : { cancelAtPeriodEnd: true, canceledAt: agora, nextPeriodSeats: null },
    });
    this.logger.log({ event: 'assentos_cancelados', groupId, status: pool.status });
    return this.overview(groupId);
  }

  /**
   * Antes de a comunidade sumir: encerra a cobrança no Asaas. Lança se não
   * conseguir — a comunidade fica inteira e o dono tenta de novo.
   */
  async encerrarAntesDeApagarGrupo(groupId: string): Promise<void> {
    await this.encerrarPools({ groupId });
  }

  /** Antes de apagar a conta do dono: as comunidades dele caem em cascata. */
  async encerrarAntesDeApagarConta(userId: string): Promise<void> {
    await this.encerrarPools({ group: { ownerId: userId } });
  }

  /**
   * Evento do Asaas que não é de assinatura de pessoa (ADR 025): da
   * assinatura dos assentos, ou da cobrança avulsa de um aumento. Chamado
   * dentro da transação do webhook, que já registrou o evento.
   *
   * Devolve `null` se aplicou, `'sem_efeito'` para evento velho ou irrelevante,
   * e `'desconhecido'` quando não é nosso.
   */
  async aplicarEventoAsaas(
    tx: Prisma.TransactionClient,
    r: Extract<ResultadoDeWebhookDeAssinatura, { ok: true }>,
  ): Promise<null | 'sem_efeito' | 'desconhecido'> {
    if (r.subscriptionId) {
      const pool = await tx.groupSeatPool.findUnique({ where: { providerRef: r.subscriptionId } });
      if (pool) return this.aplicarNoPool(tx, pool, r);
    }
    if (r.paymentId) {
      const ajuste = await tx.groupSeatAdjustment.findUnique({
        where: { providerChargeId: r.paymentId },
        include: { pool: true },
      });
      if (ajuste) return this.aplicarNoAjuste(tx, ajuste, r);
    }
    return 'desconhecido';
  }

  private async aplicarNoPool(
    tx: Prisma.TransactionClient,
    pool: GroupSeatPool,
    r: Extract<ResultadoDeWebhookDeAssinatura, { ok: true }>,
  ): Promise<null | 'sem_efeito'> {
    const mudanca = mudancaDoEvento({ ...pool, interval: 'MONTHLY' }, r.event, r.dueDate);
    if (!mudanca) return 'sem_efeito';

    // Renovação paga: a redução pedida passa a valer agora.
    const renovou =
      mudanca.currentPeriodEnd !== undefined &&
      pool.currentPeriodEnd !== null &&
      mudanca.currentPeriodEnd > pool.currentPeriodEnd;
    const reduzir = renovou && pool.nextPeriodSeats !== null ? pool.nextPeriodSeats : null;

    await tx.groupSeatPool.update({
      where: { id: pool.id },
      data: {
        ...mudanca,
        ...(reduzir !== null ? { seats: reduzir, nextPeriodSeats: null } : {}),
      },
    });

    if (reduzir !== null) {
      // O 409 da redução impede sobra; se mesmo assim sobrar (atribuição
      // concorrente), saem os atribuídos mais recentes.
      const abertos = await tx.groupSeatAssignment.findMany({
        where: { poolId: pool.id, revokedAt: null },
        orderBy: { assignedAt: 'desc' },
        select: { id: true },
      });
      const excesso = abertos.slice(0, Math.max(0, abertos.length - reduzir));
      if (excesso.length) {
        await tx.groupSeatAssignment.updateMany({
          where: { id: { in: excesso.map((a) => a.id) } },
          data: { revokedAt: new Date() },
        });
      }
    }
    return null;
  }

  private async aplicarNoAjuste(
    tx: Prisma.TransactionClient,
    ajuste: { id: string; status: SubscriptionStatus; pool: GroupSeatPool },
    r: Extract<ResultadoDeWebhookDeAssinatura, { ok: true }>,
  ): Promise<null | 'sem_efeito'> {
    const pool = ajuste.pool;
    switch (r.event) {
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED': {
        if (ajuste.status === 'ACTIVE') return 'sem_efeito';
        await tx.groupSeatAdjustment.update({
          where: { id: ajuste.id },
          data: { status: 'ACTIVE' },
        });
        // O atraso do pool era deste ajuste (a recorrente está em dia): sai do atraso.
        const recorrenteEmDia =
          pool.currentPeriodEnd !== null && pool.currentPeriodEnd > new Date();
        if (pool.status === 'PAST_DUE' && recorrenteEmDia) {
          const outros = await tx.groupSeatAdjustment.count({
            where: { poolId: pool.id, status: 'PAST_DUE', id: { not: ajuste.id } },
          });
          if (outros === 0) {
            await tx.groupSeatPool.update({
              where: { id: pool.id },
              data: { status: 'ACTIVE', graceEndsAt: null },
            });
          }
        }
        return null;
      }
      case 'PAYMENT_OVERDUE': {
        if (ajuste.status !== 'PENDING') return 'sem_efeito';
        await tx.groupSeatAdjustment.update({
          where: { id: ajuste.id },
          data: { status: 'PAST_DUE' },
        });
        // Pró-rata vencido põe a comunidade em atraso, com a mesma carência
        // da recorrente; os assentos continuam valendo durante ela.
        if (pool.status === 'ACTIVE') {
          const vencimento = r.dueDate ?? vencimentoAvulso(new Date());
          await tx.groupSeatPool.update({
            where: { id: pool.id },
            data: {
              status: 'PAST_DUE',
              graceEndsAt: dayBoundsInTz(addDaysIso(vencimento, CARENCIA_DIAS), FUSO_DO_PROVEDOR)
                .start,
            },
          });
        }
        return null;
      }
      case 'PAYMENT_DELETED':
      case 'PAYMENT_REFUNDED':
      case 'PAYMENT_CHARGEBACK_REQUESTED':
        if (ajuste.status === 'CANCELED') return 'sem_efeito';
        await tx.groupSeatAdjustment.update({
          where: { id: ajuste.id },
          data: { status: 'CANCELED' },
        });
        return null;
      default:
        return 'sem_efeito';
    }
  }

  private async encerrarPools(where: Prisma.GroupSeatPoolWhereInput): Promise<void> {
    const vivos = await this.prisma.groupSeatPool.findMany({
      where: { ...where, status: { in: VIVOS }, providerRef: { not: null } },
      select: { groupId: true, providerRef: true },
    });
    if (vivos.length === 0) return;
    const erro = () =>
      new ServiceUnavailableException(
        'Não conseguimos cancelar a cobrança dos assentos da comunidade agora. Tente de novo em alguns minutos.',
      );
    if (!this.provedor) throw erro();
    for (const pool of vivos) {
      try {
        await this.provedor.cancelSubscription(pool.providerRef as string);
      } catch (err) {
        this.logger.error({
          event: 'cancelamento_de_assentos_ao_apagar_falhou',
          groupId: pool.groupId,
          err: (err as Error).name,
        });
        throw erro();
      }
    }
  }

  /** O pool que ainda conta. Encerrado (ou inexistente) é 404. */
  private async poolVivo(groupId: string): Promise<GroupSeatPool> {
    const pool = await this.prisma.groupSeatPool.findUnique({ where: { groupId } });
    if (!pool || !VIVOS.includes(pool.status)) throw new NotFoundException(SEM_ASSENTOS);
    return pool;
  }

  private contarAtribuidos(poolId: string): Promise<number> {
    return this.prisma.groupSeatAssignment.count({ where: { poolId, revokedAt: null } });
  }

  private exigirProvedor(): SeatProvider {
    if (!this.provedor) {
      throw new ServiceUnavailableException(
        'A compra de assentos pela web não está disponível nesta instância.',
      );
    }
    return this.provedor;
  }
}

function validarAssentos(seats: number): void {
  if (!Number.isInteger(seats) || seats < 1 || seats > ASSENTOS_MAX) {
    throw new BadRequestException(`O número de assentos vai de 1 a ${ASSENTOS_MAX}.`);
  }
}

function rotuloAssentos(n: number): string {
  return n === 1 ? '1 assento' : `${n} assentos`;
}

function lotado(seats: number): string {
  const uso =
    seats === 1 ? 'O único assento está em uso' : `Todos os ${seats} assentos estão em uso`;
  return `${uso}. Aumente os assentos ou retire um antes.`;
}
