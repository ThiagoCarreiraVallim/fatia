import { PrismaClient } from '@fatia/db';
import { dayBoundsInTz } from '../progress/helpers/date-tz';
import { runGuarded } from './production-guard';

/**
 * `pnpm billing:grant-group` — PRO para todos os membros ativos de uma
 * comunidade (#288, #386), na fase de piloto, sem cobrança.
 *
 * O contrato é o pool da comunidade em modo `ALL_MEMBERS`, de cortesia
 * (`providerRef: null`): enquanto ele vale, todo membro ativo (papel MEMBER) tem
 * o PRO pago pela comunidade, sem atribuir assento um a um. Com `--until`, vira
 * um programa com data final ("PRO até 30/11 · Programa Verão 21"): o PRO acaba
 * sozinho no fim daquele dia, no fuso de São Paulo. `--revoke` encerra na hora.
 *
 * Comunidade com assentos pagos não é tocada: a mudança de contrato passa pelo
 * painel (#403).
 *
 * ```
 * pnpm billing:grant-group <slug> [--until 2026-11-30] [--program "Verão 21"]
 * pnpm billing:grant-group <slug> --revoke
 * ```
 *
 * Em produção recusa sem `--i-know-this-is-production` (`production-guard.ts`).
 */

export interface GrantGroupArgs {
  slug: string;
  /** Último dia do programa, `YYYY-MM-DD`. */
  until: string | null;
  program: string | null;
  revoke: boolean;
}

const USAGE =
  'Uso: pnpm billing:grant-group <slug> [--until AAAA-MM-DD] [--program "Nome"] | --revoke';
const FUSO = 'America/Sao_Paulo';

export function parseGrantGroupArgs(argv: string[]): GrantGroupArgs {
  const valueOf = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 ? (argv[i + 1]?.trim() ?? '') : null;
  };
  const flagValues = new Set(
    ['--until', '--program'].map((f) => argv.indexOf(f) + 1).filter((i) => i > 0),
  );
  const [slug] = argv.filter((a, i) => !a.startsWith('--') && !flagValues.has(i));
  if (!slug?.trim()) throw new Error(USAGE);
  const until = valueOf('--until');
  if (until !== null && !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    throw new Error('--until precisa de uma data AAAA-MM-DD');
  }
  const program = valueOf('--program') || null;
  if (program && !until) throw new Error('Programa precisa de data final (--until)');
  return { slug: slug.trim(), until, program, revoke: argv.includes('--revoke') };
}

/** O que o script vai mudar, mostrado antes de aplicar. */
export function describeGrantGroup(args: GrantGroupArgs): string {
  if (args.revoke) return `Encerrar agora o PRO de todos os membros da comunidade ${args.slug}`;
  const quando = args.until ? ` até ${args.until} (fim do dia em São Paulo)` : ', sem data final';
  const programa = args.program ? `, programa "${args.program}"` : '';
  return `Dar PRO a todos os membros ativos da comunidade ${args.slug}${quando}${programa}`;
}

type Db = Pick<PrismaClient, 'group' | 'groupSeatPool'>;

export async function grantGroup(prisma: Db, args: GrantGroupArgs): Promise<string> {
  const group = await prisma.group.findUnique({
    where: { slug: args.slug },
    select: { id: true, name: true, ownerId: true, seatPool: true },
  });
  if (!group) throw new Error(`Nenhuma comunidade com o código ${args.slug}`);
  const pool = group.seatPool;
  if (pool && pool.providerRef !== null) {
    throw new Error(`${group.name} tem assentos pagos; o contrato muda pelo painel.`);
  }

  if (args.revoke) {
    if (!pool || pool.mode !== 'ALL_MEMBERS') return `Nada a encerrar em ${group.name}`;
    await prisma.groupSeatPool.update({
      where: { id: pool.id },
      data: { status: 'EXPIRED', canceledAt: new Date(), cancelAtPeriodEnd: false },
    });
    return `PRO de todos os membros encerrado em ${group.name}`;
  }

  // O dia inteiro vale: acaba às 23:59:59.999 desse dia, em São Paulo — e é
  // esse o dia que a tela mostra ("PRO até 30/11"), não o seguinte.
  const end = args.until ? new Date(dayBoundsInTz(args.until, FUSO).end.getTime() - 1) : null;
  const data = {
    mode: 'ALL_MEMBERS' as const,
    status: 'ACTIVE' as const,
    programName: args.program,
    currentPeriodEnd: end,
    cancelAtPeriodEnd: end !== null,
    graceEndsAt: null,
    canceledAt: null,
  };
  if (pool) {
    await prisma.groupSeatPool.update({ where: { id: pool.id }, data });
  } else {
    await prisma.groupSeatPool.create({
      data: { ...data, groupId: group.id, seats: 0, unitPriceCents: 0, createdById: group.ownerId },
    });
  }
  const quando = args.until ? ` até ${args.until}` : '';
  const programa = args.program ? ` (programa ${args.program})` : '';
  return `PRO para todos os membros de ${group.name}${quando}${programa}`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let args: GrantGroupArgs;
  try {
    args = parseGrantGroupArgs(argv);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    process.exitCode = await runGuarded({
      argv,
      env: process.env,
      plan: describeGrantGroup(args),
      apply: () => grantGroup(prisma, args),
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) void main();
