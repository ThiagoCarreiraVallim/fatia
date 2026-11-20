import type { AiEntitlement } from '../billing/ai-entitlement';

/** De onde vem o PRO da pessoa. */
export type ProOrigin = 'PERSONAL' | 'COMMUNITY' | 'PROGRAM' | 'INSTANCE';

/**
 * O estado do PRO para a própria pessoa (#403), no `get_me`: de onde vem e até
 * quando. Nada da cobrança da comunidade (fatura, preço, atraso, carência): a
 * pessoa nunca vê a conta da academia. "Até quando" só aparece quando o PRO
 * tem fim marcado — o programa, o teste, ou o PRO dela cancelado.
 */
export interface ProStatus {
  tier: 'FREE' | 'PRO';
  origin: ProOrigin | null;
  /** A comunidade que dá o PRO. */
  community: string | null;
  /** O programa que dá o PRO ("Verão 21"). */
  program: string | null;
  /** Fim marcado do PRO (ISO); nulo quando renova ou não tem fim. */
  until: string | null;
}

const FREE: ProStatus = { tier: 'FREE', origin: null, community: null, program: null, until: null };

export function proStatusOf(direito: AiEntitlement): ProStatus {
  if (direito.source === 'INSTANCE') return { ...FREE, tier: 'PRO', origin: 'INSTANCE' };
  const s = direito.subscription;
  if (direito.tier !== 'PRO' || !s) return FREE;
  if (s.source === 'GROUP') {
    const community = s.group?.name ?? null;
    if (s.paidBy === 'PROGRAM') {
      return {
        tier: 'PRO',
        origin: 'PROGRAM',
        community,
        program: s.programName ?? null,
        until: s.programEndsAt?.toISOString() ?? null,
      };
    }
    return { tier: 'PRO', origin: 'COMMUNITY', community, program: null, until: null };
  }
  const fim =
    direito.motivo === 'teste'
      ? (s.trialEndsAt ?? null)
      : s.cancelAtPeriodEnd
        ? s.currentPeriodEnd
        : null;
  return { ...FREE, tier: 'PRO', origin: 'PERSONAL', until: fim?.toISOString() ?? null };
}
