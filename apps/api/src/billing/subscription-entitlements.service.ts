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
  endsAt: true,
  program: { select: { name: true } },
  pool: { select: POOL_AS_SUBSCRIPTION },
} as const;

/**
 * Atribuições que valem agora (#403): começo e fim são lidos, como a carência,
 * sem job. Fora da janela a linha continua lá — só não dá PRO.
 */
function seatInWindow(now: Date) {
  return {
    revokedAt: null,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    ],
  };
}

type SeatRow = {
  assignedAt: Date;
  endsAt: Date | null;
  program: { name: string } | null;
  pool: PoolRow;
};

/**
 * Um assento lido como assinatura. O de programa (#403) é pago pelo programa e
 * acaba no fim dele: se o fim vem antes do fim do período do pool, ele é o fim
 * mostrado ("PRO até 30/11 · Programa Verão 21"). O atraso do pool continua
 * valendo do mesmo jeito.
 */
function seatAsSubscription(seat: SeatRow): AssinaturaLida {
  const base = poolAsSubscription(seat.pool, seat.assignedAt, 'SEAT');
  if (!seat.program && !seat.endsAt) return base;
  const fimDoPool = seat.pool.currentPeriodEnd;
  const acabaAntes = seat.endsAt && (!fimDoPool || seat.endsAt <= fimDoPool);
  return {
    ...base,
    ...(acabaAntes ? { currentPeriodEnd: seat.endsAt, cancelAtPeriodEnd: true } : {}),
    ...(seat.program
      ? { paidBy: 'PROGRAM' as const, programName: seat.program.name, programEndsAt: seat.endsAt }
      : {}),
  };
}

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
  prisma: Pick<PrismaService, 'groupSeatAssignment' | 'groupSeatPool'>,
  userId: string,
  now: Date = new Date(),
): Promise<AssinaturaLida[]> {
  const [assentos, comunidades] = await Promise.all([
    prisma.groupSeatAssignment.findMany({
      where: { ...seatInWindow(now), membership: { userId, status: 'ACTIVE' } },
      select: SEAT_AS_SUBSCRIPTION,
    }),
    allMembersPools(prisma, { userId }),
  ]);
  return [
    ...assentos.map(seatAsSubscription),
    ...comunidades.flatMap((pool) =>
      pool.group.memberships.map((m) =>
        poolAsSubscription(pool, m.joinedAt ?? m.createdAt, 'COMMUNITY'),
      ),
    ),
  ];
}

/**
 * Pools em `ALL_MEMBERS` com as memberships pedidas que contam: ativas e de
 * papel MEMBER (a equipe não é aluna). Lido pelo pool para uma consulta só.
 */
function allMembersPools(
  prisma: Pick<PrismaService, 'groupSeatPool'>,
  membership: { userId: string } | { id: { in: string[] } },
) {
  const where = { ...membership, status: 'ACTIVE' as const, role: 'MEMBER' as const };
  return prisma.groupSeatPool.findMany({
    where: { mode: 'ALL_MEMBERS', group: { memberships: { some: where } } },
    select: {
      ...POOL_AS_SUBSCRIPTION,
      group: {
        select: {
          id: true,
          name: true,
          memberships: { where, select: { id: true, joinedAt: true, createdAt: true } },
        },
      },
    },
  });
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
  prisma: Pick<PrismaService, 'groupSeatAssignment' | 'groupSeatPool'>,
  membershipIds: string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  if (membershipIds.length === 0) return new Set();
  const [seats, comunidades] = await Promise.all([
    prisma.groupSeatAssignment.findMany({
      where: {
        ...seatInWindow(now),
        membershipId: { in: membershipIds },
        membership: { status: 'ACTIVE' },
      },
      select: SEAT_AS_SUBSCRIPTION,
    }),
    allMembersPools(prisma, { id: { in: membershipIds } }),
  ]);
  const valendo = (a: AssinaturaLida) => resolveAiEntitlement([a], now).tier === 'PRO';
  return new Set([
    ...seats.filter((seat) => valendo(seatAsSubscription(seat))).map((seat) => seat.membershipId),
    ...comunidades
      .filter((pool) => valendo(poolAsSubscription(pool, now, 'COMMUNITY')))
      .flatMap((pool) => pool.group.memberships.map((m) => m.id)),
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

/**
 * A comunidade que paga o PRO desta pessoa **agora**, pela mesma regra do
 * portão (`resolveAiEntitlement`), ou `null`. Assinatura própria valendo vence
 * o assento: aí quem paga é a pessoa, mesmo com assento atribuído (#393, I2).
 * É o "PRO pago pela academia" e o "se sair, volta ao Free" das telas.
 */
export async function proPayerGroupOf(
  prisma: Pick<PrismaService, 'userSubscription' | 'groupSeatAssignment' | 'groupSeatPool'>,
  userId: string,
  agora: Date = new Date(),
): Promise<string | null> {
  const [proprias, assentos] = await Promise.all([
    prisma.userSubscription.findMany({ where: { userId }, select: ASSINATURA_LIDA }),
    seatsAsSubscriptions(prisma, userId, agora),
  ]);
  const direito = resolveAiEntitlement([...proprias, ...assentos], agora);
  return direito.tier === 'PRO' && direito.source === 'GROUP'
    ? (direito.subscription?.group?.id ?? null)
    : null;
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
        seatsAsSubscriptions(this.prisma, userId, agora),
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
