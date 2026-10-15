import { PrismaClient } from '@fatia/db';

/**
 * `pnpm billing:grant-seat` — assento de IA de cortesia numa comunidade
 * (ADR 025), sem cobrança.
 *
 * Para o E2E provar "PRO pela comunidade" sem passar pelo Asaas, e para a
 * equipe dar assentos a um parceiro. O pool de cortesia é `providerRef: null`;
 * comunidade com assentos pagos não é tocada (atribua pela API). `--purge`
 * apaga as atribuições da pessoa naquele pool de cortesia, e o pool junto se
 * ficar vazio — devolve a conta demo ao estado em que estava.
 *
 * ```
 * pnpm billing:grant-seat <email> <slug> [--seats 5]
 * pnpm billing:grant-seat <email> <slug> --purge
 * ```
 */

export interface ArgumentosDoAssento {
  email: string;
  slug: string;
  assentos: number;
  apagar: boolean;
}

const USO = 'Uso: pnpm billing:grant-seat <email> <slug> [--seats N] | --purge';

export function leArgumentosDoAssento(argv: string[]): ArgumentosDoAssento {
  const i = argv.indexOf('--seats');
  const posicionais = argv.filter((a, j) => !a.startsWith('--') && !(i >= 0 && j === i + 1));
  const [email, slug] = posicionais.map((a) => a.trim());
  if (!email || !email.includes('@') || !slug) throw new Error(USO);
  let assentos = 1;
  if (i >= 0) {
    assentos = Number(argv[i + 1]);
    if (!Number.isInteger(assentos) || assentos <= 0) {
      throw new Error('--seats precisa ser um inteiro positivo');
    }
  }
  return { email: email.toLowerCase(), slug, assentos, apagar: argv.includes('--purge') };
}

type Prisma = Pick<
  PrismaClient,
  'user' | 'group' | 'groupMembership' | 'groupSeatPool' | 'groupSeatAssignment'
>;

export async function concederAssento(
  prisma: Prisma,
  args: ArgumentosDoAssento,
  unitPriceCents = 1490,
): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email: args.email }, select: { id: true } });
  if (!user) throw new Error(`Nenhuma conta com o e-mail ${args.email}`);
  const group = await prisma.group.findUnique({
    where: { slug: args.slug },
    select: { id: true, name: true, ownerId: true, seatPool: true },
  });
  if (!group) throw new Error(`Nenhuma comunidade com o código ${args.slug}`);
  const pool = group.seatPool;

  if (args.apagar) {
    if (!pool || pool.providerRef !== null) return `Nada a apagar em ${group.name}`;
    const { count } = await prisma.groupSeatAssignment.deleteMany({
      where: { poolId: pool.id, membership: { userId: user.id } },
    });
    const restantes = await prisma.groupSeatAssignment.count({ where: { poolId: pool.id } });
    if (restantes === 0) await prisma.groupSeatPool.delete({ where: { id: pool.id } });
    return `${count} assento(s) de cortesia apagado(s) de ${args.email} em ${group.name}`;
  }

  if (pool && pool.providerRef !== null) {
    throw new Error(`${group.name} tem assentos pagos; atribua pela API da comunidade.`);
  }
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: user.id } },
    select: { id: true, status: true },
  });
  if (!membership || membership.status !== 'ACTIVE') {
    throw new Error(`${args.email} não é membro ativo de ${group.name}`);
  }

  const cortesia = pool
    ? await prisma.groupSeatPool.update({
        where: { id: pool.id },
        data: { seats: Math.max(pool.seats, args.assentos), status: 'ACTIVE', canceledAt: null },
      })
    : await prisma.groupSeatPool.create({
        data: {
          groupId: group.id,
          seats: args.assentos,
          unitPriceCents,
          status: 'ACTIVE',
          createdById: group.ownerId,
        },
      });

  const aberta = await prisma.groupSeatAssignment.findFirst({
    where: { poolId: cortesia.id, membershipId: membership.id, revokedAt: null },
  });
  if (!aberta) {
    const usados = await prisma.groupSeatAssignment.count({
      where: { poolId: cortesia.id, revokedAt: null },
    });
    if (usados >= cortesia.seats) {
      await prisma.groupSeatPool.update({
        where: { id: cortesia.id },
        data: { seats: usados + 1 },
      });
    }
    await prisma.groupSeatAssignment.create({
      data: { poolId: cortesia.id, membershipId: membership.id, assignedById: group.ownerId },
    });
  }
  return `Assento de cortesia para ${args.email} em ${group.name}`;
}

async function main(): Promise<void> {
  let args: ArgumentosDoAssento;
  try {
    args = leArgumentosDoAssento(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const preco = Number(process.env.BILLING_SEAT_MONTHLY_CENTS ?? 1490);
    console.log(await concederAssento(prisma, args, preco));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) void main();
