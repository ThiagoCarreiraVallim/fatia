import type { BillingInterval, SubscriptionSource, SubscriptionStatus } from '@prisma/client';
import { decideAiTier, SEM_IA, type DecisaoDeTier, type StatusDeAssinatura } from './ai-tier';

/**
 * Direito à IA hospedada de uma pessoa (ADR 024): a leitura que o portão da IA
 * e a tela "Meu plano" fazem, a partir das assinaturas dela.
 *
 * Função pura, como `decideAiTier`, que ela reusa para a carência e a
 * inadimplência: nada aqui grava, e o estado efetivo sai das datas. É isso que
 * dispensa um job para "expirar" assinaturas — uma renovação que não chegou
 * degrada sozinha na leitura seguinte.
 */

/** Carência depois do vencimento, para Pix, boleto e webhook atrasado. */
export const CARENCIA_DIAS = 7;
/**
 * Folga entre o fim do período e "a renovação não veio". O webhook da
 * renovação chega horas depois do vencimento; sem a folga, toda virada de mês
 * mostraria "em atraso" por algumas horas.
 */
export const FOLGA_DE_RENOVACAO_MS = 24 * 60 * 60 * 1000;

const DIA_MS = 24 * 60 * 60 * 1000;

export interface AssinaturaLida {
  id: string;
  source: SubscriptionSource;
  status: SubscriptionStatus;
  interval: BillingInterval | null;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
}

export type MotivoDoDireito = DecisaoDeTier['motivo'] | 'instancia' | 'pendente' | 'expirada';

export interface AiEntitlement {
  tier: 'FREE' | 'PRO';
  /** `INSTANCE` quando a instância não exige plano (`AI_REQUIRES_PLAN=false`). */
  source: SubscriptionSource | 'INSTANCE' | null;
  motivo: MotivoDoDireito;
  /** Havia um PRO e ele não vale agora (atraso além da carência, cancelado). */
  degraded: boolean;
  /** A assinatura que decidiu, para a tela mostrar validade e origem. */
  subscription: AssinaturaLida | null;
}

export const INSTANCIA_LIBERADA: AiEntitlement = {
  tier: 'PRO',
  source: 'INSTANCE',
  motivo: 'instancia',
  degraded: false,
  subscription: null,
};

/** Como `decideAiTier` lê uma assinatura nossa, agora. `null` = não conta. */
function paraTier(a: AssinaturaLida, agora: Date): DecisaoDeTier | null {
  const fim = a.currentPeriodEnd;
  let status: StatusDeAssinatura;
  let carencia: Date | null = a.graceEndsAt;

  switch (a.status) {
    case 'PENDING':
      return null;
    case 'EXPIRED':
      return { tier: SEM_IA, degraded: true, motivo: 'cancelada' };
    case 'CANCELED':
      status = 'CANCELED';
      break;
    case 'PAST_DUE':
      status = 'PAST_DUE';
      carencia ??= fim ? new Date(fim.getTime() + CARENCIA_DIAS * DIA_MS) : null;
      break;
    case 'ACTIVE':
      if (!fim) {
        status = 'ACTIVE'; // cortesia sem prazo
      } else if (fim > agora) {
        status = 'ACTIVE';
      } else if (a.cancelAtPeriodEnd) {
        status = 'CANCELED'; // cancelou e o período acabou
      } else if (agora.getTime() - fim.getTime() <= FOLGA_DE_RENOVACAO_MS) {
        status = 'ACTIVE'; // renovação a caminho
      } else {
        // A renovação não chegou: trata como atraso, com a mesma carência.
        status = 'PAST_DUE';
        carencia ??= new Date(fim.getTime() + CARENCIA_DIAS * DIA_MS);
      }
      break;
    default:
      return { tier: SEM_IA, degraded: true, motivo: 'sem_assinatura' };
  }

  return decideAiTier({ status, tier: 'PRO', gracePeriodEndsAt: carencia }, agora);
}

/**
 * O maior direito entre as assinaturas. Vale a ativa; depois a em carência;
 * sem nenhuma valendo, a mais recente explica o porquê (para a tela dizer
 * "seu PRO venceu" em vez de só "Free").
 */
export function resolverDireitoIa(
  assinaturas: AssinaturaLida[],
  agora: Date = new Date(),
): AiEntitlement {
  const lidas = assinaturas
    .map((a) => ({ a, d: paraTier(a, agora) }))
    .filter((x): x is { a: AssinaturaLida; d: DecisaoDeTier } => x.d !== null);

  const ordem = (m: DecisaoDeTier['motivo']) => (m === 'ativa' ? 0 : m === 'carencia' ? 1 : 2);
  const valendo = lidas
    .filter((x) => x.d.tier !== SEM_IA)
    .sort(
      (x, y) =>
        ordem(x.d.motivo) - ordem(y.d.motivo) ||
        (y.a.currentPeriodEnd?.getTime() ?? Infinity) -
          (x.a.currentPeriodEnd?.getTime() ?? Infinity),
    )[0];

  if (valendo) {
    return {
      tier: 'PRO',
      source: valendo.a.source,
      motivo: valendo.d.motivo,
      degraded: false,
      subscription: valendo.a,
    };
  }

  const pendente = assinaturas
    .filter((a) => a.status === 'PENDING')
    .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())[0];
  if (pendente) {
    return {
      tier: 'FREE',
      source: pendente.source,
      motivo: 'pendente',
      degraded: false,
      subscription: pendente,
    };
  }

  const recente = lidas.sort((x, y) => y.a.createdAt.getTime() - x.a.createdAt.getTime())[0];
  if (recente) {
    return {
      tier: 'FREE',
      source: recente.a.source,
      motivo: recente.a.status === 'EXPIRED' ? 'expirada' : recente.d.motivo,
      degraded: true,
      subscription: recente.a,
    };
  }

  return {
    tier: 'FREE',
    source: null,
    motivo: 'sem_assinatura',
    degraded: false,
    subscription: null,
  };
}
