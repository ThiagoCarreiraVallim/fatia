import { PrismaClient } from '@fatia/db';

/**
 * `pnpm billing:grant-pro` — PRO de cortesia (fonte `MANUAL`), sem cobrança.
 *
 * Para a equipe dar PRO a quem precisa (parceiro, suporte, teste) e para o E2E
 * provar a tela do PRO sem passar por pagamento. `--revoke` expira toda
 * cortesia ativa da pessoa; `--purge` apaga as cortesias, inclusive as
 * expiradas — para o E2E devolver a conta demo ao estado em que estava (uma
 * expirada faria a tela dizer "seu PRO venceu") e para cortesia lançada por
 * engano. Assinatura paga nunca é tocada.
 *
 * ```
 * pnpm billing:grant-pro <email> [--days 30]
 * pnpm billing:grant-pro <email> --revoke
 * pnpm billing:grant-pro <email> --purge
 * ```
 */

export interface Argumentos {
  email: string;
  dias: number | null;
  revogar: boolean;
  apagar: boolean;
}

const USO = 'Uso: pnpm billing:grant-pro <email> [--days 30] | --revoke | --purge';

export function leArgumentos(argv: string[]): Argumentos {
  const email = argv.find((a) => !a.startsWith('--'))?.trim();
  if (!email || !email.includes('@')) {
    throw new Error(USO);
  }
  const revogar = argv.includes('--revoke');
  const apagar = argv.includes('--purge');
  if (revogar && apagar) throw new Error(USO);
  const i = argv.indexOf('--days');
  let dias: number | null = null;
  if (i >= 0) {
    dias = Number(argv[i + 1]);
    if (!Number.isInteger(dias) || dias <= 0)
      throw new Error('--days precisa ser um inteiro positivo');
  }
  return { email: email.toLowerCase(), dias, revogar, apagar };
}

export async function concederOuRevogar(
  prisma: Pick<PrismaClient, 'user' | 'userSubscription'>,
  args: Argumentos,
  agora = new Date(),
): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email: args.email }, select: { id: true } });
  if (!user) throw new Error(`Nenhuma conta com o e-mail ${args.email}`);

  if (args.apagar) {
    const { count } = await prisma.userSubscription.deleteMany({
      where: { userId: user.id, source: 'MANUAL' },
    });
    return `${count} cortesia(s) apagada(s) de ${args.email}`;
  }

  if (args.revogar) {
    const { count } = await prisma.userSubscription.updateMany({
      where: { userId: user.id, source: 'MANUAL', status: 'ACTIVE' },
      data: { status: 'EXPIRED', canceledAt: agora },
    });
    return `${count} cortesia(s) expirada(s) para ${args.email}`;
  }

  await prisma.userSubscription.create({
    data: {
      userId: user.id,
      source: 'MANUAL',
      status: 'ACTIVE',
      currentPeriodEnd: args.dias ? new Date(agora.getTime() + args.dias * 86_400_000) : null,
    },
  });
  return `PRO de cortesia para ${args.email}${args.dias ? ` por ${args.dias} dias` : ' sem prazo'}`;
}

async function main(): Promise<void> {
  let args: Argumentos;
  try {
    args = leArgumentos(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    console.log(await concederOuRevogar(prisma, args));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) void main();
