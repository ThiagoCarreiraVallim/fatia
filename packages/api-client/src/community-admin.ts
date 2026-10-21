import { apiFetch } from './http';
import type { PostPolicy } from './community-feed';
import type {
  GroupRole,
  GroupType,
  JoinPolicy,
  MembershipChange,
  MembershipStatus,
  MyGroup,
} from './community';
import type { ShareScope } from './sharing';

/**
 * O painel da equipe da comunidade (Fase 6): criar e cuidar da comunidade,
 * convidar, aprovar, mudar papel, assentos e o painel agregado. A API é o
 * portão de verdade (matriz de `docs/PERMISSIONS.md`); a tela só esconde o que
 * o papel não alcança.
 */

export type GroupVisibility = 'PUBLIC' | 'PRIVATE';
/** Papéis que se concedem por convite, aprovação ou mudança. Dono só por transferência. */
export type GrantableRole = Exclude<GroupRole, 'OWNER'>;

export interface CreateGroupInput {
  type: GroupType;
  name: string;
  description?: string;
  joinPolicy?: JoinPolicy;
  visibility?: GroupVisibility;
  timezone?: string;
  /** O que quem entra como membro precisa compartilhar. Ausente = nada obrigatório. */
  requiredSharingScopes?: ShareScope[];
}

export interface UpdateGroupInput {
  name?: string;
  description?: string | null;
  joinPolicy?: JoinPolicy;
  visibility?: GroupVisibility;
  timezone?: string;
  postPolicy?: PostPolicy;
  /** Vale para quem entrar dali em diante: quem já está dentro não passa a dever nada. */
  requiredSharingScopes?: ShareScope[];
}

/** O grupo como a API devolve ao criar ou editar. */
export interface GroupRecord {
  id: string;
  type: GroupType;
  name: string;
  slug: string;
  description: string | null;
  joinPolicy: JoinPolicy;
  visibility: GroupVisibility;
  timezone: string | null;
  createdAt: string;
  requiredSharingScopes: ShareScope[];
}

/** Uma pessoa na lista de membros, vista pela equipe (dono ou profissional). */
export interface PanelMember {
  membershipId: string;
  name: string;
  role: GroupRole;
  status: MembershipStatus;
  joinedAt: string | null;
  /** O que esta pessoa compartilha com quem pergunta. Só para a equipe. */
  scopesGrantedToMe?: ShareScope[];
  /** A comunidade paga o PRO desta pessoa. Só para a equipe. */
  hasAiSeat?: boolean;
}

export interface InviteView {
  id: string;
  role: GroupRole;
  email: string | null;
  maxUses: number | null;
  uses: number;
  expiresAt: string;
  createdAt: string;
  lastSentAt: string | null;
}

export interface CreateInviteInput {
  role: GrantableRole;
  email?: string;
  maxUses?: number;
  expiresInDays?: number;
}

/** O link aparece só nesta resposta: o banco guarda o hash do token. */
export interface CreatedInvite {
  invite: InviteView;
  url: string;
  emailSent: boolean;
}

export type BatchSkipReason = 'invalid' | 'duplicate' | 'member' | 'pending_invite';

export interface BatchInviteResult {
  created: { email: string; inviteId: string; emailSent: boolean }[];
  skipped: { email: string; reason: BatchSkipReason }[];
}

export type PoolStatus = 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

export interface SeatsOverview {
  groupId: string;
  unitPriceCents: number;
  /** Compra pela web disponível nesta instância. */
  webCheckout: boolean;
  pool: {
    seats: number;
    nextPeriodSeats: number | null;
    status: PoolStatus;
    manual: boolean;
    currentPeriodEnd: string | null;
    graceEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
    paymentUrl: string | null;
    monthlyCents: number;
    nextMonthlyCents: number;
  } | null;
  assigned: number;
  assignments: { membershipId: string; name: string; assignedAt: string; ownPro: boolean }[];
  pendingCharges: {
    id: string;
    fromSeats: number;
    toSeats: number;
    amountCents: number;
    status: PoolStatus;
    createdAt: string;
  }[];
}

export type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'VOID';

export interface SeatInvoice {
  id: string;
  kind: 'SUBSCRIPTION' | 'ADJUSTMENT';
  amountCents: number;
  dueDate: string | null;
  status: InvoiceStatus;
  invoiceUrl: string | null;
  paidAt: string | null;
  createdAt: string;
}

export type InsightsPanel = 'retention' | 'behavior';
export type InsightsPeriod = 'last_30_days' | 'last_90_days' | 'last_12_months';

export interface InsightsCell {
  key: string;
  /** `null` quando a célula foi suprimida (menos de 5 pessoas). */
  value: number | null;
  n: number | null;
  suppressed: boolean;
}

export interface InsightsAggregate {
  cut: string;
  period: InsightsPeriod;
  cells: InsightsCell[];
  /** Nenhuma célula visível: a tela diz "amostra insuficiente", nunca 0. */
  insufficientSample: boolean;
}

const base = '/api/groups';
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const orgApi = {
  create: (input: CreateGroupInput) => apiFetch<GroupRecord>(base, json('POST', input)),
  update: (groupId: string, input: UpdateGroupInput) =>
    apiFetch<GroupRecord>(`${base}/${groupId}`, json('PATCH', input)),
  remove: (groupId: string) => apiFetch<{ id: string }>(`${base}/${groupId}`, json('DELETE')),
  transferOwner: (groupId: string, membershipId: string) =>
    apiFetch<MyGroup>(`${base}/${groupId}/owner`, json('POST', { membershipId })),

  members: (groupId: string) => apiFetch<PanelMember[]>(`${base}/${groupId}/members`),
  approve: (groupId: string, membershipId: string, role?: GrantableRole) =>
    apiFetch<MembershipChange>(
      `${base}/${groupId}/members/${membershipId}/approve`,
      json('POST', role ? { role } : {}),
    ),
  /** Remove um membro ou recusa um pedido de entrada. */
  removeMember: (groupId: string, membershipId: string) =>
    apiFetch<MembershipChange>(`${base}/${groupId}/members/${membershipId}`, json('DELETE')),
  setRole: (groupId: string, membershipId: string, role: GrantableRole) =>
    apiFetch<MembershipChange>(
      `${base}/${groupId}/members/${membershipId}`,
      json('PATCH', { role }),
    ),

  invites: (groupId: string) => apiFetch<InviteView[]>(`${base}/${groupId}/invites`),
  createInvite: (groupId: string, input: CreateInviteInput) =>
    apiFetch<CreatedInvite>(`${base}/${groupId}/invites`, json('POST', input)),
  createInviteBatch: (
    groupId: string,
    input: { emails: string[]; role: GrantableRole; expiresInDays?: number },
  ) => apiFetch<BatchInviteResult>(`${base}/${groupId}/invites/batch`, json('POST', input)),
  revokeInvite: (groupId: string, inviteId: string) =>
    apiFetch<InviteView>(`${base}/${groupId}/invites/${inviteId}`, json('DELETE')),
  resendInvite: (groupId: string, inviteId: string) =>
    apiFetch<CreatedInvite>(`${base}/${groupId}/invites/${inviteId}/resend`, json('POST')),
};

export const seatsApi = {
  get: (groupId: string) => apiFetch<SeatsOverview>(`${base}/${groupId}/seats`),
  /** O documento (CPF/CNPJ) vai ao Asaas e não é guardado. */
  checkout: (groupId: string, seats: number, taxId: string) =>
    apiFetch<SeatsOverview>(`${base}/${groupId}/seats/checkout`, json('POST', { seats, taxId })),
  update: (groupId: string, seats: number) =>
    apiFetch<SeatsOverview>(`${base}/${groupId}/seats`, json('PATCH', { seats })),
  cancel: (groupId: string) =>
    apiFetch<SeatsOverview>(`${base}/${groupId}/seats/cancel`, json('POST')),
  assign: (groupId: string, membershipId: string) =>
    apiFetch<SeatsOverview>(`${base}/${groupId}/seats/assignments/${membershipId}`, json('POST')),
  unassign: (groupId: string, membershipId: string) =>
    apiFetch<SeatsOverview>(`${base}/${groupId}/seats/assignments/${membershipId}`, json('DELETE')),
  invoices: (groupId: string) => apiFetch<SeatInvoice[]>(`${base}/${groupId}/seats/invoices`),
};

export const insightsApi = {
  /** Que painéis a comunidade tem: retenção sempre; comportamento com o add-on. */
  panels: (groupId: string) =>
    apiFetch<{ retention: boolean; behavior: boolean }>(`${base}/${groupId}/insights/panels`),
  cuts: (groupId: string, panel: InsightsPanel) =>
    apiFetch<{ cuts: string[] }>(`${base}/${groupId}/insights/${panel}/cuts`),
  aggregate: (groupId: string, panel: InsightsPanel, cut: string, period: InsightsPeriod) =>
    apiFetch<InsightsAggregate>(
      `${base}/${groupId}/insights/${panel}?${new URLSearchParams({ cut, period }).toString()}`,
    ),
  /** Caminho do CSV do painel pago, para abrir pelo proxy autenticado. */
  behaviorExportPath: (groupId: string, cut: string, period: InsightsPeriod) =>
    `${base}/${groupId}/insights/behavior/export?${new URLSearchParams({ cut, period }).toString()}`,
};
