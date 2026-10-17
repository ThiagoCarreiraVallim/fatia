import { randomBytes } from 'node:crypto';
import { PrismaClient, type GroupRole } from '@fatia/db';
import { hashInviteToken, INVITE_DEFAULT_DAYS, INVITE_MAX_DAYS } from './invite.service';

/**
 * `pnpm community:invite` — link de convite de uma comunidade, sem o painel da
 * equipe (Fase 6).
 *
 * Para o E2E e para testar à mão: cria um convite por link em nome da dona e
 * imprime a URL. `--purge <email>` devolve a pessoa ao estado de antes de
 * entrar: apaga a associação (o assento cai junto, em cascata), os vínculos
 * dela no grupo e os convites da comunidade que não são de outra pessoa.
 *
 * ```
 * pnpm community:invite <slug> [--role MEMBER|PROFESSIONAL|CREATOR] [--days 7]
 * pnpm community:invite <slug> --purge <email>
 * ```
 */

const INVITABLE: readonly GroupRole[] = ['MEMBER', 'PROFESSIONAL', 'CREATOR'];

export type InviteArgs =
  | { slug: string; purge: false; role: GroupRole; days: number }
  | { slug: string; purge: true; email: string };

const USAGE =
  'Uso: pnpm community:invite <slug> [--role MEMBER|PROFESSIONAL|CREATOR] [--days N] | --purge <email>';

function valueOf(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function parseInviteArgs(argv: string[]): InviteArgs {
  // Posição do valor de cada flag presente, para o código da comunidade não ser confundido com ele.
  const flagged = new Set(
    ['--role', '--days', '--purge'].filter((f) => argv.includes(f)).map((f) => argv.indexOf(f) + 1),
  );
  const [slug] = argv.filter((a, i) => !a.startsWith('--') && !flagged.has(i));
  if (!slug) throw new Error(USAGE);

  if (argv.includes('--purge')) {
    const email = valueOf(argv, '--purge')?.trim().toLowerCase();
    if (!email?.includes('@')) throw new Error(USAGE);
    return { slug, purge: true, email };
  }

  const role = (valueOf(argv, '--role') ?? 'MEMBER').toUpperCase() as GroupRole;
  if (!INVITABLE.includes(role)) throw new Error(`--role precisa ser ${INVITABLE.join(', ')}`);
  const days = Number(valueOf(argv, '--days') ?? INVITE_DEFAULT_DAYS);
  if (!Number.isInteger(days) || days < 1 || days > INVITE_MAX_DAYS) {
    throw new Error(`--days vai de 1 a ${INVITE_MAX_DAYS}`);
  }
  return { slug, purge: false, role, days };
}

type Prisma = Pick<
  PrismaClient,
  'user' | 'group' | 'groupInvite' | 'groupMembership' | 'professionalLink'
>;

export async function runCommunityInvite(
  prisma: Prisma,
  args: InviteArgs,
  webOrigin = 'http://localhost:3030',
  now = new Date(),
): Promise<string> {
  const group = await prisma.group.findUnique({
    where: { slug: args.slug },
    select: { id: true, name: true, ownerId: true },
  });
  if (!group) throw new Error(`Nenhuma comunidade com o código ${args.slug}`);

  if (args.purge) {
    const user = await prisma.user.findUnique({
      where: { email: args.email },
      select: { id: true },
    });
    if (!user) throw new Error(`Nenhuma conta com o e-mail ${args.email}`);
    const links = await prisma.professionalLink.deleteMany({
      where: {
        groupId: group.id,
        OR: [{ subjectUserId: user.id }, { professionalId: user.id }],
      },
    });
    const memberships = await prisma.groupMembership.deleteMany({
      where: { groupId: group.id, userId: user.id },
    });
    // Convite de link (sem e-mail) ou para esta pessoa; convite por e-mail de
    // outra pessoa não é sobra dela.
    const invites = await prisma.groupInvite.deleteMany({
      where: { groupId: group.id, OR: [{ email: null }, { email: args.email }] },
    });
    return `${args.email} fora de ${group.name}: ${memberships.count} associação, ${links.count} vínculo(s), ${invites.count} convite(s) apagados`;
  }

  const token = randomBytes(32).toString('base64url');
  await prisma.groupInvite.create({
    data: {
      groupId: group.id,
      tokenHash: hashInviteToken(token),
      role: args.role,
      createdById: group.ownerId,
      expiresAt: new Date(now.getTime() + args.days * 86_400_000),
    },
  });
  return `${webOrigin.replace(/\/$/, '')}/c/${token}`;
}

async function main(): Promise<void> {
  let args: InviteArgs;
  try {
    args = parseInviteArgs(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    console.log(await runCommunityInvite(prisma, args, process.env.WEB_ORIGIN));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) void main();
