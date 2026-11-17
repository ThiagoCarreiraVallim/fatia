import { Prisma } from '@prisma/client';

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
 * Circuito (#380) é a sessão com o circuito congelado (`circuit` não nulo),
 * mesmo vinda de um plano: o retrato não decide sozinho, e "Planos" e "Livres"
 * deixam o circuito de fora.
 */
export const SESSION_KINDS = ['plan', 'circuit', 'free'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export function sessionKind(session: {
  planId: string | null;
  fromPlan?: boolean;
  circuit?: unknown;
}): SessionKind {
  if (session.circuit != null) return 'circuit';
  return session.planId || session.fromPlan ? 'plan' : 'free';
}

const NOT_CIRCUIT: Prisma.WorkoutSessionWhereInput = { circuit: { equals: Prisma.AnyNull } };

/** O `where` do Prisma que casa as sessões de um tipo. Sem tipo, não restringe. */
export function sessionKindWhere(kind: SessionKind | undefined): Prisma.WorkoutSessionWhereInput {
  switch (kind) {
    case 'plan':
      return { OR: [{ planId: { not: null } }, { fromPlan: true }], ...NOT_CIRCUIT };
    case 'free':
      return { planId: null, fromPlan: false, ...NOT_CIRCUIT };
    case 'circuit':
      return { circuit: { not: Prisma.AnyNull } };
    default:
      return {};
  }
}
