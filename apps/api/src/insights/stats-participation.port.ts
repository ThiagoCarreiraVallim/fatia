import { Injectable } from '@nestjs/common';

/**
 * Quem entra na contagem — o consentimento próprio da agregação (#159).
 *
 * **Isto não é `ProfessionalLink`.** O destinatário do agregado é o **dono** da
 * academia, e pela matriz da #156 o dono nunca recebe vínculo: ele não lê dado
 * individual de ninguém, em escopo nenhum. Então não há vínculo a consultar
 * aqui. Participar do agregado é uma permissão diferente e menor — entrar numa
 * contagem — e mantê-la separada do vínculo é o que preserva a matriz: o dono
 * continua sem nenhum caminho até um indivíduo.
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

/**
 * A porta. Uma implementação hoje, outra quando a coluna existir.
 */
@Injectable()
export abstract class StatsParticipation {
  /** Participantes ativos e consentidos do grupo. Nunca lança. */
  abstract participants(groupId: string): Promise<Participant[]>;
}

/**
 * Implementação de hoje: **ninguém participa**.
 *
 * O opt-in mora em `GroupMembership.statsOptIn`, e essa coluna **não existe** no
 * `schema.prisma` desta rodada — a migration está proposta no corpo da PR e não
 * foi aplicada aqui de propósito. Sem a coluna não há como saber quem consentiu,
 * e a única resposta defensável para "não sei quem consentiu" é **ninguém**.
 *
 * O efeito é o painel responder "amostra insuficiente" para todo grupo, sempre.
 * É inútil, e é o comportamento certo: o contrário seria contar quem nunca disse
 * sim. A troca, quando a coluna entrar, é uma implementação nova desta porta
 * (`ACTIVE` + `statsOptIn: true`) e um `provide` no módulo — nenhum arquivo de
 * agregação, recorte ou export é tocado.
 */
@Injectable()
export class NoStatsParticipation extends StatsParticipation {
  async participants(): Promise<Participant[]> {
    return [];
  }
}
