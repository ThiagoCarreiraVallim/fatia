import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import {
  INSTANCIA_LIBERADA,
  resolveAiEntitlement,
  type AiEntitlement,
  type AssinaturaLida,
} from './ai-entitlement';

/** Colunas que `resolveAiEntitlement` lê. */
export const ASSINATURA_LIDA = {
  id: true,
  source: true,
  status: true,
  interval: true,
  currentPeriodEnd: true,
  graceEndsAt: true,
  cancelAtPeriodEnd: true,
  createdAt: true,
  trialEndsAt: true,
} as const;

/** O que se lê de um pool para tratá-lo como assinatura. */
const POOL_AS_SUBSCRIPTION = {
  id: true,
  status: true,
  currentPeriodEnd: true,
  graceEndsAt: true,
  cancelAtPeriodEnd: true,
  programName: true,
  group: { select: { id: true, name: true } },
} as const;

/** O que se lê de uma atribuição de assento para tratá-la como assinatura. */
const SEAT_AS_SUBSCRIPTION = {
  membershipId: true,
  assignedAt: true,
  pool: { select: POOL_AS_SUBSCRIPTION },
} as const;

type PoolRow = Omit<AssinaturaLida, 'source' | 'interval' | 'createdAt' | 'group'> & {
  programName: string | null;
  group: { id: string; name: string };
};

/**
 * Um pool da comunidade lido como assinatura. Programa (nome e data final) é
 * pago pelo programa; o resto, pelo assento ou pela comunidade inteira.
 */
function poolAsSubscription(
  pool: PoolRow,
  since: Date,
  payer: 'SEAT' | 'COMMUNITY',
): AssinaturaLida {
  return {
    id: pool.id,
    source: 'GROUP',
    status: pool.status,
    interval: 'MONTHLY',
    currentPeriodEnd: pool.currentPeriodEnd,
    graceEndsAt: pool.graceEndsAt,
    cancelAtPeriodEnd: pool.cancelAtPeriodEnd,
    createdAt: since,
    group: pool.group,
    paidBy: pool.programName ? 'PROGRAM' : payer,
    programName: pool.programName,
  };
}

/**
 * O PRO que a comunidade dá à pessoa, lido como assinatura (ADR 025, #288):
 *
 * - assento atribuído, não revogado, numa membership ACTIVE;
 * - comunidade em `ALL_MEMBERS`, em que a pessoa é membro (papel MEMBER) ativo.
 *
 * Quem sai da comunidade perde os dois na hora: o filtro é pelo status da
 * membership, lido a cada chamada.
 */
export async function seatsAsSubscriptions(
  prisma: Pick<PrismaService, 'groupSeatAssignment' | 'groupMembership'>,
  userId: string,
): Promise<AssinaturaLida[]> {
  const [assentos, todos] = await Promise.all([
    prisma.groupSeatAssignment.findMany({
      where: { revokedAt: null, membership: { userId, status: 'ACTIVE' } },
      select: SEAT_AS_SUBSCRIPTION,
    }),
    prisma.groupMembership.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        role: 'MEMBER',
        group: { seatPool: { mode: 'ALL_MEMBERS' } },
      },
      select: {
        joinedAt: true,
        createdAt: true,
        group: { select: { seatPool: { select: POOL_AS_SUBSCRIPTION } } },
      },
    }),
  ]);
  return [
    ...assentos.map((a) => poolAsSubscription(a.pool, a.assignedAt, 'SEAT')),
    ...todos.flatMap((m) =>
      m.group.seatPool
        ? [poolAsSubscription(m.group.seatPool, m.joinedAt ?? m.createdAt, 'COMMUNITY')]
        : [],
    ),
  ];
}

/**
 * Das memberships pedidas, as que têm o PRO pago pela comunidade **valendo
 * agora**: assento atribuído, ou membro de comunidade em `ALL_MEMBERS`.
 *
 * É a consulta que a comunidade usa para mostrar "tem PRO" (`hasAiSeat`), e a
 * regra é a do portão (`resolveAiEntitlement`). Cancelar o pool ou deixá-lo
 * vencer não revoga as atribuições — o dono pode reativar e elas voltam —,
 * então contar só a atribuição dizia que a pessoa tinha IA paga pela comunidade
 * quando o portão já respondia FREE. O painel vê só isso: nunca se a pessoa
 * paga o próprio PRO, nem como.
 */
export async function membershipsWithEffectiveSeat(
  prisma: Pick<PrismaService, 'groupSeatAssignment' | 'groupMembership'>,
  membershipIds: string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  if (membershipIds.length === 0) return new Set();
  const [seats, todos] = await Promise.all([
    prisma.groupSeatAssignment.findMany({
      where: {
        revokedAt: null,
        membershipId: { in: membershipIds },
        membership: { status: 'ACTIVE' },
      },
      select: SEAT_AS_SUBSCRIPTION,
    }),
    prisma.groupMembership.findMany({
      where: {
        id: { in: membershipIds },
        status: 'ACTIVE',
        role: 'MEMBER',
        group: { seatPool: { mode: 'ALL_MEMBERS' } },
      },
      select: {
        id: true,
        createdAt: true,
        group: { select: { seatPool: { select: POOL_AS_SUBSCRIPTION } } },
      },
    }),
  ]);
  const valendo = (a: AssinaturaLida) => resolveAiEntitlement([a], now).tier === 'PRO';
  return new Set([
    ...seats
      .filter((seat) => valendo(poolAsSubscription(seat.pool, seat.assignedAt, 'SEAT')))
      .map((seat) => seat.membershipId),
    ...todos
      .filter(
        (m) =>
          m.group.seatPool !== null &&
          valendo(poolAsSubscription(m.group.seatPool, m.createdAt, 'COMMUNITY')),
      )
      .map((m) => m.id),
  ]);
}

/**
 * A porta do direito à IA hospedada (ADR 024): Free ou PRO, agora.
 *
 * Porta separada de `BillingEntitlements` (add-on de insights do grupo) porque
 * os consumidores são outros: aqui é o portão da IA em `ai/`, e quem paga é a
 * própria pessoa — ou a comunidade, pelo assento (ADR 025), que entra como mais
 * uma fonte dentro de `aiTierForUser`, sem mudar quem chama.
 */
@Injectable()
export abstract class AiEntitlements {
  /**
   * **Nunca lança.** Falha de banco responde FREE: degradar a IA é o pior caso
   * aceitável, e o app inteiro continua funcionando sem ela.
   */
  abstract aiTierForUser(userId: string, agora?: Date): Promise<AiEntitlement>;
  /** A instância exige plano para a IA? (`AI_REQUIRES_PLAN`). */
  abstract exigePlano(): boolean;
}

@Injectable()
export class SubscriptionEntitlementsService extends AiEntitlements {
  private readonly logger = new Logger(SubscriptionEntitlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  exigePlano(): boolean {
    return this.config.get<boolean>('AI_REQUIRES_PLAN', false) === true;
  }

  async aiTierForUser(userId: string, agora: Date = new Date()): Promise<AiEntitlement> {
    try {
      const [proprias, assentos] = await Promise.all([
        this.prisma.userSubscription.findMany({ where: { userId }, select: ASSINATURA_LIDA }),
        seatsAsSubscriptions(this.prisma, userId),
      ]);
      const assinaturas: AssinaturaLida[] = [...proprias, ...assentos];
      const direito = resolveAiEntitlement(assinaturas, agora);
      // Sem exigência de plano, todo mundo usa a IA; quem assinou mesmo assim
      // continua vendo a própria assinatura.
      if (!this.exigePlano() && direito.tier === 'FREE') return INSTANCIA_LIBERADA;
      return direito;
    } catch (err) {
      this.logger.error({ event: 'ai_entitlement_failed', userId, err: String(err) });
      return this.exigePlano()
        ? {
            tier: 'FREE',
            source: null,
            motivo: 'sem_assinatura',
            degraded: false,
            subscription: null,
          }
        : INSTANCIA_LIBERADA;
    }
  }
}
