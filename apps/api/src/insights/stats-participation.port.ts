import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/**
 * Quem entra na contagem — o consentimento próprio da agregação (#159).
 *
 * **Isto não é `ProfessionalLink`.** O vínculo (ADR 026) abre o dado
 * individual de uma pessoa para a equipe, nas categorias que ela escolheu.
 * Participar do agregado é uma permissão diferente e menor — entrar numa
 * contagem anônima com amostra mínima — e é dada à parte, no mesmo momento
 * (`GroupMembership.statsOptIn`). Mantê-las separadas é o que deixa alguém
 * entrar na estatística sem abrir nada de si, e vice-versa.
 *
 * O denominador também sai daqui. Numerador consentido sobre denominador cheio
 * vazaria informação exatamente sobre quem **não** consentiu.
 */
export interface Participant {
  userId: string;
  /**
   * Fuso do participante. Faixa de horário de treino é no relógio de quem
   * treinou; calcular no fuso do servidor produziria "pico às 22h" para uma
   * academia cujo movimento é às 19h.
   */
  timezone: string;
  /** Entrada no grupo — é o eixo de coorte de `retention_by_cohort`. */
  joinedAt: Date | null;
}

/** A porta: os agregados não sabem de onde vem o consentimento. */
@Injectable()
export abstract class StatsParticipation {
  /** Participantes ativos e consentidos do grupo. Nunca lança. */
  abstract participants(groupId: string): Promise<Participant[]>;
}

/**
 * Quem está **ativo** no grupo e disse sim às estatísticas.
 *
 * Pedido pendente, quem saiu e quem foi removido ficam fora mesmo com o
 * opt-in gravado: a linha continua no banco para o histórico, mas a pessoa não
 * está mais lá para ser contada. O padrão da coluna é `false`, então quem nunca
 * respondeu também não entra.
 */
@Injectable()
export class OptInStatsParticipation extends StatsParticipation {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async participants(groupId: string): Promise<Participant[]> {
    const linhas = await this.prisma.groupMembership.findMany({
      where: { groupId, status: 'ACTIVE', statsOptIn: true },
      select: { userId: true, joinedAt: true, user: { select: { timezone: true } } },
    });
    return linhas.map((m) => ({
      userId: m.userId,
      timezone: m.user.timezone,
      joinedAt: m.joinedAt,
    }));
  }
}
