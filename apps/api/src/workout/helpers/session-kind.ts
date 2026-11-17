import type { Prisma } from '@prisma/client';

/**
 * O tipo da sessão no histórico (#381, prancha `Al-T10`): plano, circuito ou
 * livre. Não existe tipo "cardio": cardio é um exercício
 * (`muscleGroup === 'cardio'`), e uma sessão só de esteira é um treino livre
 * com um exercício.
 *
 * "De plano" vem do retrato gravado ao começar (`fromPlan`), e não só do
 * `planId`: apagar o plano zera a FK (ON DELETE SET NULL), e a sessão não pode
 * virar "Treino livre" por isso. O `planId` ainda conta para as sessões criadas
 * sem o retrato (seeds, linhas antigas que o backfill já cobriu).
 *
 * **Ponto de extensão (#380):** o circuito ainda não existe no banco. Quando a
 * #380 der ao plano (ou à sessão) a marca de circuito, `sessionKind` passa a
 * lê-la e `sessionKindWhere('circuit')` a filtrar por ela. Até lá nenhuma
 * sessão é circuito, e o filtro de circuito volta vazio.
 */
export const SESSION_KINDS = ['plan', 'circuit', 'free'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export function sessionKind(session: { planId: string | null; fromPlan?: boolean }): SessionKind {
  return session.planId || session.fromPlan ? 'plan' : 'free';
}

/** O `where` do Prisma que casa as sessões de um tipo. Sem tipo, não restringe. */
export function sessionKindWhere(kind: SessionKind | undefined): Prisma.WorkoutSessionWhereInput {
  switch (kind) {
    case 'plan':
      return { OR: [{ planId: { not: null } }, { fromPlan: true }] };
    case 'free':
      return { planId: null, fromPlan: false };
    case 'circuit':
      return { id: { in: [] } };
    default:
      return {};
  }
}
