import type { Prisma } from '@fatia/db';
import type { PrismaService } from './prisma.service';

/**
 * Os treinos e os planos de quem vai ser apagado, antes da conta.
 *
 * O exercício próprio cai em cascata com a conta, mas o plano e a série que
 * apontam para ele são `RESTRICT` (`WorkoutPlanExercise` e `SessionSet`): o
 * Postgres apaga o exercício antes do plano e a exclusão inteira falha. Saindo
 * antes, na mesma transação de lote, a cascata não encontra quem a trave.
 */
export function ownWorkoutPurge(
  prisma: PrismaService,
  users: Prisma.UserWhereInput,
): Prisma.PrismaPromise<unknown>[] {
  return [
    prisma.workoutSession.deleteMany({ where: { user: users } }),
    prisma.workoutPlan.deleteMany({ where: { user: users } }),
  ];
}

/**
 * A aluna fictícia da demo (#412), com tudo o que é dela: treinos e planos
 * antes (pelo motivo acima), a conta depois. Sai antes do grupo da demo.
 */
export function demoStudentPurge(
  prisma: PrismaService,
  users: Prisma.UserWhereInput,
): Prisma.PrismaPromise<unknown>[] {
  const fictitious: Prisma.UserWhereInput = { AND: [users, { demoGroupId: { not: null } }] };
  return [...ownWorkoutPurge(prisma, fictitious), prisma.user.deleteMany({ where: fictitious })];
}
