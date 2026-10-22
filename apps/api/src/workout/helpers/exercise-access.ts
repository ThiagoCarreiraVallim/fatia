import { MembershipStatus, type Prisma } from '@fatia/db';

/**
 * Quem enxerga qual exercício (ADR 030). Um lugar só, porque a mesma pergunta
 * aparece na busca, no detalhe, ao registrar série, na prescrição, no recorde,
 * na prévia do chat e na adoção de plano — e cada cópia do `where` era um lugar
 * para esquecer o exercício da comunidade.
 *
 * O catálogo público é `createdByUserId: null` **e** `groupOwned: false`. Só o
 * primeiro, como era antes da Fase 7b, punha no catálogo de todo mundo o
 * exercício que uma comunidade criou e depois perdeu (`groupId` em SetNull).
 */
export const CATALOG_EXERCISE = {
  createdByUserId: null,
  groupOwned: false,
} as const satisfies Prisma.ExerciseWhereInput;

/** Comunidades em que a pessoa está ativa. */
export const activeMemberOf = (userId: string) =>
  ({
    memberships: { some: { userId, status: MembershipStatus.ACTIVE } },
  }) satisfies Prisma.GroupWhereInput;

/**
 * O que aparece na busca: catálogo, os exercícios da pessoa e os das
 * comunidades em que ela está ativa.
 */
export function searchableExercises(userId: string): Prisma.ExerciseWhereInput {
  return {
    OR: [
      CATALOG_EXERCISE,
      { createdByUserId: userId },
      { groupOwned: true, group: activeMemberOf(userId) },
    ],
  };
}

/**
 * O que a pessoa pode abrir e usar: o que ela busca, mais o exercício de
 * comunidade que já está num plano ou numa série dela. Quem sai da academia
 * continua vendo o próprio histórico — sair não apaga treino de ninguém.
 */
export function readableExercises(userId: string): Prisma.ExerciseWhereInput {
  return {
    OR: [
      CATALOG_EXERCISE,
      { createdByUserId: userId },
      {
        groupOwned: true,
        OR: [
          { group: activeMemberOf(userId) },
          { planExercises: { some: { plan: { userId } } } },
          { sessionSets: { some: { session: { userId } } } },
        ],
      },
    ],
  };
}
