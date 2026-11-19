import { randomInt } from 'node:crypto';
import { GroupVisibility, JoinPolicy, type GroupAiMode, type Group } from '@fatia/db';
import { resolveAiEntitlement } from '../billing/ai-entitlement';
import type { PrismaService } from '../common/prisma.service';
import { isInviteUsable } from './invite-state';

/**
 * Código de entrada da comunidade (#393, Cm-02).
 *
 * Duas coisas valem como código: o código legível que a equipe gera (um
 * `GroupInvite` com `code`, revogável, para o QR da recepção) e o `slug` —
 * este **só em comunidade pública** (descobrível). O slug não se revoga, então
 * em comunidade privada ele não abre a porta: lá só se entra por código gerado
 * ou por convite. Os dois seguem a `joinPolicy`: código não é aprovação, ao
 * contrário do link de convite.
 */

/** Sem 0/O, 1/I/L: o código é lido em voz alta e digitado da parede. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ENTRY_CODE_LENGTH = 8;

export function newEntryCode(): string {
  let out = '';
  for (let i = 0; i < ENTRY_CODE_LENGTH; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** "ad7k-3q9p " → "AD7K3Q9P". */
export function normalizeEntryCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export interface ResolvedEntry {
  group: Group;
  /** O convite com código que abriu a porta; nulo quando foi o slug. */
  inviteId: string | null;
  /** Limite de usos do convite com código; nulo = sem limite (ou slug). */
  inviteMaxUses: number | null;
  /** O que o cliente manda de volta ao entrar: o código normalizado ou o slug. */
  code: string;
}

/**
 * A comunidade de um código, ou `null`. Código revogado, vencido, esgotado e
 * comunidade só por convite dão `null` igual a código que não existe: a rota
 * não pode virar oráculo de existência de academia.
 */
export async function findGroupByEntryCode(
  prisma: Pick<PrismaService, 'group' | 'groupInvite'>,
  raw: string,
  now: Date = new Date(),
): Promise<ResolvedEntry | null> {
  const code = normalizeEntryCode(raw);
  if (code.length === ENTRY_CODE_LENGTH) {
    const convite = await prisma.groupInvite.findUnique({
      where: { code },
      include: { group: true },
    });
    if (
      convite &&
      isInviteUsable(convite, now) &&
      convite.group.joinPolicy !== JoinPolicy.INVITE_ONLY
    ) {
      return { group: convite.group, inviteId: convite.id, inviteMaxUses: convite.maxUses, code };
    }
  }
  const slug = raw.trim().toLowerCase();
  const group = await prisma.group.findUnique({ where: { slug } });
  if (
    !group ||
    group.visibility !== GroupVisibility.PUBLIC ||
    group.joinPolicy === JoinPolicy.INVITE_ONLY
  ) {
    return null;
  }
  return { group, inviteId: null, inviteMaxUses: null, code: slug };
}

/**
 * O PRO que a comunidade oferece a quem entra agora como membro (Cm-02), pela
 * regra do portão (`resolveAiEntitlement`): `ALL_MEMBERS` libera para todos;
 * `SEATS` com vaga só **pode** liberar (a equipe é quem dá o assento); sem pool
 * valendo ou sem vaga, `null`. O aviso não pode prometer o que o portão não dá.
 */
export async function groupProOffer(
  prisma: Pick<PrismaService, 'groupSeatPool' | 'groupSeatAssignment'>,
  groupId: string,
  now: Date = new Date(),
): Promise<GroupAiMode | null> {
  const pool = await prisma.groupSeatPool.findUnique({ where: { groupId } });
  if (!pool) return null;
  const valendo =
    resolveAiEntitlement(
      [
        {
          id: pool.id,
          source: 'GROUP',
          status: pool.status,
          interval: 'MONTHLY',
          currentPeriodEnd: pool.currentPeriodEnd,
          graceEndsAt: pool.graceEndsAt,
          cancelAtPeriodEnd: pool.cancelAtPeriodEnd,
          createdAt: pool.createdAt,
        },
      ],
      now,
    ).tier === 'PRO';
  if (!valendo) return null;
  if (pool.mode === 'ALL_MEMBERS') return 'ALL_MEMBERS';
  const ocupados = await prisma.groupSeatAssignment.count({
    where: { poolId: pool.id, revokedAt: null, membership: { status: 'ACTIVE' } },
  });
  return ocupados < pool.seats ? 'SEATS' : null;
}
