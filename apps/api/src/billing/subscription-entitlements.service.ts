import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import {
  INSTANCIA_LIBERADA,
  resolverDireitoIa,
  type AiEntitlement,
  type AssinaturaLida,
} from './ai-entitlement';

/** Colunas que `resolverDireitoIa` lê. */
export const ASSINATURA_LIDA = {
  id: true,
  source: true,
  status: true,
  interval: true,
  currentPeriodEnd: true,
  graceEndsAt: true,
  cancelAtPeriodEnd: true,
  createdAt: true,
} as const;

/**
 * Assentos ativos da pessoa, lidos como assinatura (ADR 025): atribuição não
 * revogada, numa membership ACTIVE. Quem sai da comunidade perde o assento
 * na mesma transação, mas o filtro por status protege contra o resto.
 */
export async function assentosComoAssinatura(
  prisma: Pick<PrismaService, 'groupSeatAssignment'>,
  userId: string,
): Promise<AssinaturaLida[]> {
  const assentos = await prisma.groupSeatAssignment.findMany({
    where: { revokedAt: null, membership: { userId, status: 'ACTIVE' } },
    select: {
      assignedAt: true,
      pool: {
        select: {
          id: true,
          status: true,
          currentPeriodEnd: true,
          graceEndsAt: true,
          cancelAtPeriodEnd: true,
          group: { select: { id: true, name: true } },
        },
      },
    },
  });
  return assentos.map(({ assignedAt, pool }) => ({
    id: pool.id,
    source: 'GROUP' as const,
    status: pool.status,
    interval: 'MONTHLY' as const,
    currentPeriodEnd: pool.currentPeriodEnd,
    graceEndsAt: pool.graceEndsAt,
    cancelAtPeriodEnd: pool.cancelAtPeriodEnd,
    createdAt: assignedAt,
    group: pool.group,
  }));
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
        assentosComoAssinatura(this.prisma, userId),
      ]);
      const assinaturas: AssinaturaLida[] = [...proprias, ...assentos];
      const direito = resolverDireitoIa(assinaturas, agora);
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
