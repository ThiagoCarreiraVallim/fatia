import type { Prisma } from '@prisma/client';

/**
 * O tipo da sessão no histórico (#381, prancha `Al-T10`): plano, circuito ou
 * livre. É derivado e nunca gravado, e não existe tipo "cardio": cardio é um
 * exercício (`muscleGroup === 'cardio'`), e uma sessão só de esteira é um
 * treino livre com um exercício.
 *
 * **Ponto de extensão (#380):** o circuito ainda não existe no banco. Quando a
 * #380 der ao plano (ou à sessão) a marca de circuito, `sessionKind` passa a
 * lê-la e `sessionKindWhere('circuit')` a filtrar por ela. Até lá nenhuma
 * sessão é circuito, e o filtro de circuito volta vazio.
 */
export const SESSION_KINDS = ['plan', 'circuit', 'free'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export function sessionKind(session: { planId: string | null }): SessionKind {
  return session.planId ? 'plan' : 'free';
}

/** O `where` do Prisma que casa as sessões de um tipo. Sem tipo, não restringe. */
export function sessionKindWhere(kind: SessionKind | undefined): Prisma.WorkoutSessionWhereInput {
  switch (kind) {
    case 'plan':
      return { planId: { not: null } };
    case 'free':
      return { planId: null };
    case 'circuit':
      return { id: { in: [] } };
    default:
      return {};
  }
}
