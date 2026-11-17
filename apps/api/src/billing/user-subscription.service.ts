import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  type BillingInterval,
  type PaymentMethod,
  type UserSubscription,
} from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { AiEntitlement, GroupPayer } from './ai-entitlement';
import type { SubscriptionProvider } from './billing-provider.port';
import { cpfValido, somenteDigitos } from './cpf';
import { SeatPoolService } from './seat-pool.service';
import { subscriptionEventChange } from './subscription-events';
import { AiEntitlements } from './subscription-entitlements.service';

// A regra dos eventos mora em `subscription-events.ts`; reexportada para quem
// já a importava daqui.
export {
  fimDoPeriodo,
  subscriptionEventChange,
  type MudancaDeAssinatura,
} from './subscription-events';

/** Token do provedor de assinatura web. `null` = instância sem Asaas configurado. */
export const SUBSCRIPTION_PROVIDER = Symbol('SUBSCRIPTION_PROVIDER');

/** Link de pagamento ainda vale para reabrir o mesmo checkout. */
const CHECKOUT_REUSAVEL_MS = 24 * 60 * 60 * 1000;

/** Onde a pessoa gerencia uma assinatura de loja. */
export const GESTAO_NA_LOJA = {
  APPLE: 'https://apps.apple.com/account/subscriptions',
  GOOGLE: 'https://play.google.com/store/account/subscriptions',
} as const;

/**
 * O estado que a tela "Meu plano" desenha (#386, `Al-M13`): um só, derivado do
 * direito e da assinatura que decidiu.
 */
export type PlanState =
  'FREE' | 'TRIAL' | 'ACTIVE' | 'PENDING' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

/** Quem paga o PRO (#386): a própria pessoa, um assento, a comunidade ou um programa. */
export type PlanPayer = 'PERSONAL' | GroupPayer;

export interface PlanoDaPessoa {
  tier: 'FREE' | 'PRO';
  source: AiEntitlement['source'];
  reason: AiEntitlement['motivo'];
  degraded: boolean;
  state: PlanState;
  status: UserSubscription['status'] | null;
  interval: BillingInterval | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  /** Fim do teste grátis, enquanto `TRIAL`. */
  trialEndsAt: string | null;
  /** Pode começar o teste grátis: nunca teve teste nem PRO pessoal. */
  trialEligible: boolean;
  /** Dias do teste grátis (`BILLING_PRO_TRIAL_DAYS`); 0 = sem teste. */
  trialDays: number;
  /** Pix, boleto ou cartão, quando a assinatura é da web. */
  paymentMethod: PaymentMethod | null;
  /**
   * Página da cobrança em aberto no Asaas (checkout, teste, renovação ou
   * atraso). Só na assinatura da web; **o app nunca mostra** (regra das lojas).
   */
  paymentUrl: string | null;
  /** Gestão fora do app (lojas). */
  manageUrl: string | null;
  /** Quem paga: a pessoa, um assento, a comunidade ou um programa. */
  paidBy: PlanPayer | null;
  /** A comunidade que paga, quando o PRO vem dela (`source: 'GROUP'`). */
  groupName: string | null;
  /** Nome do programa ("Verão 21"), quando `paidBy` é `PROGRAM`. */
  programName: string | null;
  /** A instância exige plano para a IA? Sem exigência, não há o que vender. */
  requiresPlan: boolean;
  /** Assinatura pela web disponível (Asaas configurado). */
  webCheckout: boolean;
  prices: { monthlyCents: number; yearlyCents: number };
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** O estado da tela, a partir do direito. */
export function planState(
  direito: Pick<AiEntitlement, 'tier' | 'source' | 'motivo' | 'degraded'>,
  cancelAtPeriodEnd: boolean,
): PlanState {
  if (direito.source === 'INSTANCE') return 'ACTIVE';
  if (direito.tier === 'PRO') {
    if (direito.motivo === 'teste') return 'TRIAL';
    if (direito.motivo === 'carencia') return 'PAST_DUE';
    return cancelAtPeriodEnd ? 'CANCELED' : 'ACTIVE';
  }
  if (direito.motivo === 'pendente') return 'PENDING';
  return direito.degraded ? 'EXPIRED' : 'FREE';
}

/**
 * Assinatura PRO pela web (Asaas) e a leitura do plano para a tela (ADR 024).
 *
 * O estado efetivo sai sempre de `AiEntitlements` — a mesma leitura do portão
 * da IA —, para a tela e o 402 nunca discordarem.
 */
@Injectable()
export class UserSubscriptionService {
  private readonly logger = new Logger(UserSubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly direitos: AiEntitlements,
    @Inject(SUBSCRIPTION_PROVIDER) private readonly provedor: SubscriptionProvider | null,
    @Optional() private readonly assentos?: SeatPoolService,
  ) {}

  prices() {
    return {
      monthlyCents: this.config.get<number>('BILLING_PRO_MONTHLY_CENTS', 1990),
      yearlyCents: this.config.get<number>('BILLING_PRO_YEARLY_CENTS', 17900),
    };
  }

  /** Dias do teste grátis do PRO; 0 desliga. */
  trialDays(): number {
    const dias = Number(this.config.get<number | string>('BILLING_PRO_TRIAL_DAYS', 7));
    return Number.isInteger(dias) && dias > 0 ? dias : 0;
  }

  /**
   * Pode começar o teste? Um por pessoa (#386): quem já começou um teste, ou
   * já teve PRO pessoal de qualquer origem (pago ou cortesia), não ganha outro.
   * O PRO dado pela comunidade não conta: não foi da pessoa.
   */
  async trialEligible(userId: string): Promise<boolean> {
    if (this.trialDays() === 0) return false;
    const [user, jaTeve] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { proTrialStartedAt: true } }),
      this.prisma.userSubscription.count({
        where: {
          userId,
          OR: [
            { status: { in: ['ACTIVE', 'PAST_DUE', 'TRIALING', 'EXPIRED'] } },
            { currentPeriodEnd: { not: null } },
          ],
        },
      }),
    ]);
    return Boolean(user) && user!.proTrialStartedAt === null && jaTeve === 0;
  }

  async plan(userId: string): Promise<PlanoDaPessoa> {
    const direito = await this.direitos.aiTierForUser(userId);
    const base = {
      tier: direito.tier,
      source: direito.source,
      reason: direito.motivo,
      degraded: direito.degraded,
      requiresPlan: this.direitos.exigePlano(),
      webCheckout: this.provedor !== null,
      prices: this.prices(),
      trialDays: this.trialDays(),
      trialEligible:
        direito.tier === 'FREE' && this.direitos.exigePlano()
          ? await this.trialEligible(userId)
          : false,
    };

    // PRO pela comunidade (ADR 025, #288): a validade é a do pool, e quem
    // gerencia é a equipe — não há checkout, cancelamento nem loja.
    if (direito.source === 'GROUP' && direito.subscription) {
      const assento = direito.subscription;
      return {
        ...base,
        state: planState(direito, assento.cancelAtPeriodEnd && !assento.programName),
        status: assento.status,
        interval: null,
        currentPeriodEnd: assento.currentPeriodEnd?.toISOString() ?? null,
        graceEndsAt: assento.graceEndsAt?.toISOString() ?? null,
        cancelAtPeriodEnd: assento.cancelAtPeriodEnd,
        trialEndsAt: null,
        paymentMethod: null,
        paymentUrl: null,
        manageUrl: null,
        paidBy: assento.paidBy ?? 'SEAT',
        groupName: assento.group?.name ?? null,
        programName: assento.programName ?? null,
      };
    }

    const sub = direito.subscription
      ? await this.prisma.userSubscription.findFirst({
          where: { id: direito.subscription.id, userId },
        })
      : null;
    const loja = sub && (sub.source === 'APPLE' || sub.source === 'GOOGLE') ? sub.source : null;
    const vivaNaWeb =
      sub?.source === 'ASAAS' && sub.status !== 'CANCELED' && sub.status !== 'EXPIRED';

    return {
      ...base,
      state: planState(direito, sub?.cancelAtPeriodEnd ?? false),
      status: sub?.status ?? null,
      interval: sub?.interval ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      graceEndsAt: sub?.graceEndsAt?.toISOString() ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      trialEndsAt: sub?.status === 'TRIALING' ? (sub.trialEndsAt?.toISOString() ?? null) : null,
      paymentMethod: sub?.paymentMethod ?? null,
      paymentUrl: vivaNaWeb ? sub.paymentUrl : null,
      manageUrl: loja ? GESTAO_NA_LOJA[loja] : null,
      paidBy: direito.tier === 'PRO' && direito.source !== 'INSTANCE' ? 'PERSONAL' : null,
      groupName: null,
      programName: null,
    };
  }

  /**
   * Abre (ou reabre) o checkout do PRO.
   *
   * Idempotente: tocar duas vezes em "Assinar" devolve o mesmo link em vez de
   * criar duas assinaturas no Asaas. Trocar de mensal para anual antes de
   * pagar cancela o checkout anterior.
   */
  async checkout(
    userId: string,
    entrada: { interval: BillingInterval; cpf: string; paymentMethod?: PaymentMethod },
  ): Promise<PlanoDaPessoa> {
    if (!cpfValido(entrada.cpf)) {
      throw new BadRequestException('CPF inválido. Confira os números e tente de novo.');
    }
    if (!this.direitos.exigePlano()) {
      throw new ConflictException('Nesta instância a IA do Fatia já é liberada para todos.');
    }
    const provedor = this.provedor;
    if (!provedor) {
      throw new ServiceUnavailableException(
        'A assinatura pela web não está disponível nesta instância.',
      );
    }

    const direito = await this.direitos.aiTierForUser(userId);
    if (direito.tier === 'PRO') {
      throw new ConflictException(
        direito.source === 'GROUP'
          ? 'Você já tem o PRO pela sua comunidade.'
          : 'Você já tem o plano PRO.',
      );
    }

    const metodo = entrada.paymentMethod ?? null;
    const pendentes = await this.prisma.userSubscription.findMany({
      where: { userId: userId, source: 'ASAAS', status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    const agora = Date.now();
    const reusavel = pendentes.find(
      (p) =>
        p.interval === entrada.interval &&
        p.paymentMethod === metodo &&
        p.paymentUrl &&
        agora - p.createdAt.getTime() < CHECKOUT_REUSAVEL_MS,
    );
    if (reusavel) return this.plan(userId);

    // Checkouts antigos (outro intervalo, outra forma ou link vencido) saem do caminho.
    for (const antigo of pendentes) {
      if (antigo.providerRef) {
        await provedor.cancelSubscription(antigo.providerRef).catch((err: Error) => {
          this.logger.warn({
            event: 'checkout_antigo_nao_cancelado',
            id: antigo.id,
            err: err.name,
          });
        });
      }
      await this.prisma.userSubscription.update({
        where: { id: antigo.id },
        data: { status: 'CANCELED', canceledAt: new Date(), paymentUrl: null },
      });
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, asaasCustomerId: true, name: true, email: true },
    });
    let clienteId = user.asaasCustomerId;
    if (!clienteId) {
      ({ providerCustomerId: clienteId } = await provedor.ensurePersonCustomer({
        userId: user.id,
        name: user.name,
        email: user.email,
        cpf: somenteDigitos(entrada.cpf),
      }));
      await this.prisma.user.update({
        where: { id: user.id },
        data: { asaasCustomerId: clienteId },
      });
    }

    // Teste grátis (#386): a primeira cobrança vence no fim do teste, e o
    // teste é marcado na conta antes de falar com o provedor — dois cliques ao
    // mesmo tempo não ganham dois testes.
    const dias = this.trialDays();
    const comTeste =
      (await this.trialEligible(user.id)) &&
      (
        await this.prisma.user.updateMany({
          where: { id: user.id, proTrialStartedAt: null },
          data: { proTrialStartedAt: new Date() },
        })
      ).count === 1;
    const fimDoTeste = comTeste ? new Date(agora + dias * DIA_MS) : null;

    const precos = this.prices();
    const { providerSubscriptionId } = await provedor.createSubscription({
      providerCustomerId: clienteId,
      valueCents: entrada.interval === 'YEARLY' ? precos.yearlyCents : precos.monthlyCents,
      cycle: entrada.interval,
      nextDueAt: fimDoTeste ?? new Date(),
      billingType: metodo ?? undefined,
      description:
        entrada.interval === 'YEARLY' ? 'Fatia PRO — plano anual' : 'Fatia PRO — plano mensal',
      externalReference: `user:${user.id}`,
    });
    const paymentUrl = await provedor.firstPaymentUrl(providerSubscriptionId);

    await this.prisma.userSubscription.create({
      data: {
        userId: user.id,
        source: 'ASAAS',
        status: comTeste ? 'TRIALING' : 'PENDING',
        interval: entrada.interval,
        providerRef: providerSubscriptionId,
        paymentUrl,
        paymentMethod: metodo,
        trialEndsAt: fimDoTeste,
        currentPeriodEnd: fimDoTeste,
      },
    });
    this.logger.log({
      event: comTeste ? 'teste_iniciado' : 'checkout_aberto',
      userId: user.id,
      interval: entrada.interval,
    });

    return this.plan(user.id);
  }

  /**
   * Cancela a recorrência. Quem já pagou continua PRO até o fim do período;
   * checkout ainda não pago é simplesmente fechado.
   */
  async cancelar(userId: string): Promise<PlanoDaPessoa> {
    const direito = await this.direitos.aiTierForUser(userId);
    if (direito.source === 'GROUP') {
      throw new ConflictException(
        'Este PRO é um assento pago pela sua comunidade; quem gerencia é a equipe dela.',
      );
    }
    const alvo =
      direito.subscription && direito.source !== 'INSTANCE'
        ? await this.prisma.userSubscription.findFirst({
            where: { id: direito.subscription.id, userId },
          })
        : null;
    if (!alvo || alvo.status === 'CANCELED' || alvo.status === 'EXPIRED') {
      throw new NotFoundException('Você não tem assinatura para cancelar.');
    }
    if (alvo.source === 'APPLE' || alvo.source === 'GOOGLE') {
      throw new ConflictException({
        message:
          alvo.source === 'APPLE'
            ? 'Assinaturas pela App Store são canceladas nos ajustes do iPhone.'
            : 'Assinaturas pelo Google Play são canceladas no app da Play Store.',
        manageUrl: GESTAO_NA_LOJA[alvo.source],
      });
    }
    if (alvo.source === 'MANUAL') {
      throw new ConflictException('Este PRO é uma cortesia da equipe; não há cobrança a cancelar.');
    }
    if (alvo.cancelAtPeriodEnd && alvo.status !== 'PENDING') return this.plan(userId);

    if (alvo.providerRef) {
      if (!this.provedor) {
        throw new ServiceUnavailableException(
          'Não foi possível falar com o meio de pagamento agora.',
        );
      }
      await this.provedor.cancelSubscription(alvo.providerRef);
    }

    await this.prisma.userSubscription.update({
      where: { id: alvo.id },
      data:
        alvo.status === 'PENDING'
          ? { status: 'CANCELED', canceledAt: new Date(), paymentUrl: null }
          : { cancelAtPeriodEnd: true, canceledAt: new Date() },
    });
    this.logger.log({ event: 'assinatura_cancelada', userId, status: alvo.status });
    return this.plan(userId);
  }

  /**
   * Antes de apagar a conta: encerra a recorrência no Asaas, para ninguém ser
   * cobrado depois de sair. Lança se não conseguir — a conta fica inteira e a
   * pessoa tenta de novo.
   */
  async encerrarAntesDeApagar(userId: string): Promise<void> {
    const vivas = await this.prisma.userSubscription.findMany({
      where: {
        userId,
        source: 'ASAAS',
        status: { in: ['PENDING', 'ACTIVE', 'PAST_DUE'] },
        providerRef: { not: null },
      },
    });
    if (vivas.length === 0) return;
    if (!this.provedor) {
      throw new ServiceUnavailableException(
        'Não conseguimos cancelar sua assinatura agora. Tente de novo em alguns minutos.',
      );
    }
    for (const sub of vivas) {
      try {
        await this.provedor.cancelSubscription(sub.providerRef as string);
      } catch (err) {
        this.logger.error({ event: 'cancelamento_ao_apagar_falhou', err: (err as Error).name });
        throw new ServiceUnavailableException(
          'Não conseguimos cancelar sua assinatura agora. Tente de novo em alguns minutos.',
        );
      }
    }
  }

  /**
   * Webhook do Asaas. Idempotente pelo id do evento: a reentrega é no-op.
   *
   * Eventos fora de ordem não regridem o estado: uma confirmação só **avança**
   * `currentPeriodEnd`, e um atraso de uma cobrança já superada é ignorado.
   */
  async handleAsaasWebhook(
    headers: Record<string, string | undefined>,
    corpo: string,
  ): Promise<{ received: true; duplicate?: true; ignored?: string }> {
    if (!this.provedor) throw new ServiceUnavailableException('Asaas não configurado.');
    const r = this.provedor.verifySubscriptionWebhook(headers, corpo);
    if (!r.ok) {
      if (r.motivo === 'token_invalido') throw new UnauthorizedException('Token inválido.');
      throw new BadRequestException('Evento inválido.');
    }

    return this.prisma.$transaction(async (tx) => {
      try {
        await tx.billingWebhookEvent.create({
          data: {
            provider: 'asaas',
            eventId: r.eventId,
            type: r.event,
            payload: {
              subscriptionId: r.subscriptionId,
              paymentId: r.paymentId,
              status: r.status,
              dueDate: r.dueDate,
            },
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return { received: true as const, duplicate: true as const };
        }
        throw err;
      }

      const marcar = (error: string | null) =>
        tx.billingWebhookEvent.update({
          where: { provider_eventId: { provider: 'asaas', eventId: r.eventId } },
          data: { processedAt: new Date(), error },
        });

      const sub = r.subscriptionId
        ? await tx.userSubscription.findUnique({
            where: { source_providerRef: { source: 'ASAAS', providerRef: r.subscriptionId } },
          })
        : null;
      if (!sub) {
        // Assentos de comunidade (ADR 025): a assinatura do pool ou a cobrança
        // avulsa de um aumento.
        const assento = this.assentos ? await this.assentos.applyAsaasEvent(tx, r) : 'desconhecido';
        if (assento !== 'desconhecido') {
          await marcar(assento);
          return { received: true as const };
        }
        // Assinatura que não é nossa: registra e responde 200, senão o Asaas
        // reentrega em laço.
        await marcar('assinatura_desconhecida');
        return { received: true as const, ignored: 'assinatura_desconhecida' };
      }

      const mudanca = subscriptionEventChange(sub, r.event, r.dueDate, r.invoiceUrl);
      if (mudanca) await tx.userSubscription.update({ where: { id: sub.id }, data: mudanca });
      await marcar(mudanca ? null : 'sem_efeito');
      return { received: true as const };
    });
  }
}
