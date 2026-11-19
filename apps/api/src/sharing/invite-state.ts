/**
 * Estado de um convite (#401), sem Prisma nem Nest: a mesma regra no aceite,
 * no código de entrada, na prévia do chat e nas listas do painel.
 */

export type InviteStatus = 'active' | 'used' | 'expired' | 'revoked' | 'declined';
export type InviteKind = 'link' | 'email' | 'code';

export interface InviteStateFields {
  email: string | null;
  code: string | null;
  maxUses: number | null;
  uses: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  declinedAt?: Date | null;
}

export function inviteKind(i: Pick<InviteStateFields, 'email' | 'code'>): InviteKind {
  return i.code ? 'code' : i.email ? 'email' : 'link';
}

/** Revogado e recusado vencem o resto; depois esgotado; depois vencido. */
export function inviteStatus(i: InviteStateFields, now: Date = new Date()): InviteStatus {
  if (i.revokedAt) return 'revoked';
  if (i.declinedAt) return 'declined';
  if (i.maxUses !== null && i.uses >= i.maxUses) return 'used';
  if (i.expiresAt && i.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

export function isInviteUsable(i: InviteStateFields, now: Date = new Date()): boolean {
  return inviteStatus(i, now) === 'active';
}

/** Filtro do Prisma para "ainda não venceu": sem prazo (`null`) também vale. */
export function notExpiredWhere(now: Date) {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}
