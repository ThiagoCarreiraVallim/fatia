import { randomInt } from 'node:crypto';
import { JoinPolicy, type Group } from '@fatia/db';
import { resolveAiEntitlement } from '../billing/ai-entitlement';
import type { PrismaService } from '../common/prisma.service';

/**
 * Código de entrada da comunidade (#393, Cm-02).
 *
 * Duas coisas valem como código: o código legível que a equipe gera (um
 * `GroupInvite` com `code`, revogável, para o QR da recepção) e o `slug`, que
 * já era o código de antes e está em cartazes distribuídos. Os dois seguem a
 * `joinPolicy`: código não é aprovação, ao contrário do link de convite.
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
      convite.revokedAt === null &&
      convite.expiresAt > now &&
      (convite.maxUses === null || convite.uses < convite.maxUses) &&
      convite.group.joinPolicy !== JoinPolicy.INVITE_ONLY
    ) {
      return { group: convite.group, inviteId: convite.id, inviteMaxUses: convite.maxUses, code };
    }
  }
  const slug = raw.trim().toLowerCase();
  const group = await prisma.group.findUnique({ where: { slug } });
  if (!group || group.joinPolicy === JoinPolicy.INVITE_ONLY) return null;
  return { group, inviteId: null, inviteMaxUses: null, code: slug };
}

/**
 * Quem entra agora como membro ganha o PRO da comunidade? Pool valendo pela
 * regra do portão (`resolveAiEntitlement`) e, no modo de assentos, ao menos um
 * livre. É o aviso "A academia libera o PRO" do Cm-02, que não pode prometer o
 * que o portão depois não dá.
 */
export async function groupHasFreeSeat(
  prisma: Pick<PrismaService, 'groupSeatPool' | 'groupSeatAssignment'>,
  groupId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const pool = await prisma.groupSeatPool.findUnique({ where: { groupId } });
  if (!pool) return false;
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
  if (!valendo) return false;
  if (pool.mode === 'ALL_MEMBERS') return true;
  const ocupados = await prisma.groupSeatAssignment.count({
    where: { poolId: pool.id, revokedAt: null, membership: { status: 'ACTIVE' } },
  });
  return ocupados < pool.seats;
}
