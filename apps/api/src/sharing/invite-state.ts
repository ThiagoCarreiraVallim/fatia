/**
 * Estado de um convite (#401), sem Prisma nem Nest: a mesma regra no aceite,
 * no código de entrada, na prévia do chat e nas listas do painel.
 */
import type { GroupRole } from '@fatia/db';
import { rolesGrantableBy } from './permissions';

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

/** Convidado há 2 dias ou mais e sem aceite: entra em Ativação pendente (#401). */
export const ACTIVATION_PENDING_AFTER_DAYS = 2;

/**
 * O filtro da Ativação pendente (Pn-22), o mesmo da tela e do contador do
 * menu: convite por e-mail sem uso nem aceite, não revogado, convidado há 2
 * dias ou mais (vencido entra: dá para renovar), recortado pelo papel (o
 * profissional só vê convite de membro). `includeDeclined` só na lista.
 */
export function activationPendingWhere(
  groupId: string,
  viewerRole: GroupRole,
  now: Date,
  opts: { includeDeclined?: boolean } = {},
) {
  return {
    groupId,
    ...inviteReachWhere(viewerRole),
    email: { not: null },
    code: null,
    uses: 0,
    acceptedAt: null,
    revokedAt: null,
    ...(opts.includeDeclined ? {} : { declinedAt: null }),
    createdAt: {
      lte: new Date(now.getTime() - ACTIVATION_PENDING_AFTER_DAYS * 24 * 60 * 60 * 1000),
    },
  };
}

/**
 * Os convites que este papel administra (#404): os dos papéis que ele pode dar
 * (`rolesGrantableBy`). Papel sem nenhum não vê convite.
 */
export function inviteReachWhere(role: GroupRole): { role: { in: GroupRole[] } } {
  return { role: { in: [...rolesGrantableBy(role)] } };
}
