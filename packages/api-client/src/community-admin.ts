import { apiFetch } from './http';
import type { PostPolicy } from './community-feed';
import type {
  GroupRole,
  GroupType,
  JoinPolicy,
  MembershipChange,
  MembershipStatus,
  MyGroup,
  TeamSpecialty,
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

/** Uma pessoa da equipe na tela Equipe e permissões (Pn-19, #404). */
export interface StaffView {
  membershipId: string;
  name: string;
  role: GroupRole;
  specialty: TeamSpecialty | null;
  /** Quantos membros acompanha; `null` para quem não acompanha por papel. */
  accompanies: number | null;
  /** Último acesso ao painel. */
  panelSeenAt: string | null;
  isMe: boolean;
  /** Quem pergunta pode trocar o papel, a especialidade ou remover. */
  manageable: boolean;
}

/** Uma linha do histórico da equipe (só o dono recebe). */
export interface StaffChange {
  at: string;
  action:
    | 'members.role'
    | 'members.specialty'
    | 'members.accompany'
    | 'group.pro_see_only_assigned'
    | string;
  actorName: string | null;
  targetName: string | null;
  targetCount: number;
  from: string | null;
  to: string | null;
}

export interface StaffOverview {
  staff: StaffView[];
  grantableRoles: GrantableRole[];
  proSeeOnlyAssigned: boolean;
  history: StaffChange[] | null;
}

/** "O que cada papel pode fazer", da mesma matriz do guarda da API. */
export interface PermissionTable {
  columns: GroupRole[];
  rows: { key: string; label: string; roles: GroupRole[] }[];
}

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
  /** Os posts automáticos ligados (#394). */
  autoPosts?: ('PLAN' | 'TIP' | 'EXERCISE' | 'CHALLENGE')[];
  /** Vale para quem entrar dali em diante: quem já está dentro não passa a dever nada. */
  requiredSharingScopes?: ShareScope[];
  /** Profissionais veem só quem acompanham (#404). */
  proSeeOnlyAssigned?: boolean;
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
  /** Por onde entrou (#401, "Entrou por"). Só para a equipe. */
  joinedVia?: {
    via: JoinVia | null;
    inviteId: string | null;
    label: string | null;
    origin: InviteOrigin | null;
  } | null;
  /** Quem da equipe acompanha (#401). Só para a equipe. */
  accompaniedBy?: { membershipId: string; name: string } | null;
  /** Quando saiu ou foi removido (aba "Saíram"). */
  leftAt?: string | null;
  /** O WhatsApp que a pessoa escolheu mostrar à equipe; nulo sem autorização. */
  whatsapp?: string | null;
}

export type JoinVia = 'INVITE' | 'CODE' | 'PAGE';
export type InviteOrigin = 'QR' | 'INSTAGRAM' | 'SITE' | 'REFERRAL' | 'EMAIL_LIST' | 'OTHER';
export type InviteStatus = 'active' | 'used' | 'expired' | 'revoked' | 'declined';
export type InviteKind = 'link' | 'email' | 'code';

export interface InviteView {
  id: string;
  /** Código de entrada legível (#393); `null` = convite por link. */
  code: string | null;
  role: GroupRole;
  email: string | null;
  maxUses: number | null;
  uses: number;
  /** Nulo = sem prazo (só link e QR, #401). */
  expiresAt: string | null;
  createdAt: string;
  lastSentAt: string | null;
  /** Nome do link que só a equipe vê ("Recepção", "Instagram"). */
  label: string | null;
  origin: InviteOrigin | null;
  sendCount: number;
  acceptedAt: string | null;
  declinedAt: string | null;
  revokedAt: string | null;
  giveSeat: boolean;
  accompaniedById: string | null;
  kind: InviteKind;
  status: InviteStatus;
}

/** Linha da tela Convites (Pn-06). */
export interface InviteOverviewRow extends InviteView {
  /** O link de novo, para Copiar; nulo quando não dá para refazer. */
  url: string | null;
  accompaniedByName: string | null;
  /** Quantos entraram por ele; nulo = amostra pequena (1 a 4). */
  joined: number | null;
}

export interface InviteOverview {
  cards: {
    activeLinks: number;
    notAccepted: number | null;
    joinedLast30Days: number | null;
    /** Só o percentual, de toda a população com opt-in (não por convite). */
    activated48h: { percent: number } | null;
  };
  invites: InviteOverviewRow[];
}

export type PendingInviteStatus = 'pending' | 'expired' | 'declined';

export interface PendingInviteItem {
  id: string;
  email: string;
  role: GroupRole;
  origin: InviteOrigin | null;
  label: string | null;
  invitedAt: string;
  lastSentAt: string | null;
  expiresAt: string | null;
  status: PendingInviteStatus;
  sendCount: number;
  canResend: boolean;
  canRenew: boolean;
}

/** Ativação pendente (Pn-22). */
export interface PendingActivation {
  cards: {
    notAccepted: number | null;
    joinedNoFirstLog: number | null;
    acceptedThisMonth: { accepted: number; total: number } | null;
  };
  origins: { origin: InviteOrigin | null; count: number }[];
  total: number;
  page: number;
  pageSize: number;
  items: PendingInviteItem[];
}

export interface PendingQuery {
  origin?: InviteOrigin | 'NONE';
  q?: string;
  page?: number;
}

export type ResendSkipReason = 'not_found' | 'expired' | 'limit' | 'too_soon';

export interface ResendManyResult {
  sent: { id: string; emailSent: boolean }[];
  skipped: { id: string; reason: ResendSkipReason }[];
}

export type MemberBulkAction = 'accompany' | 'seat' | 'unseat';

export interface MemberBulkInput {
  action: MemberBulkAction;
  membershipIds: string[];
  /** Para `accompany`: o profissional, ou `null` para "Ninguém". */
  accompaniedByMembershipId?: string | null;
}

export interface CreateInviteInput {
  role: GrantableRole;
  email?: string;
  maxUses?: number;
  expiresInDays?: number;
  /** Gera um código de entrada (QR da recepção) em vez de link. Só de membro. */
  code?: boolean;
  label?: string;
  origin?: InviteOrigin;
  /** "Sem prazo": só link e QR; o e-mail vence em 30 dias. */
  noExpiry?: boolean;
  accompaniedByMembershipId?: string;
  /** Quem entra ganha assento PRO, se houver vaga. Só o dono. */
  giveSeat?: boolean;
}

/** O link aparece só nesta resposta: o banco guarda o hash do token. */
export interface CreatedInvite {
  invite: InviteView;
  url: string;
  emailSent: boolean;
}

export type BatchSkipReason =
  'invalid' | 'duplicate' | 'member' | 'pending_invite' | 'declined' | 'limit';

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

  /** `includeLeft`: também quem saiu ou foi removido (aba "Saíram"). */
  members: (groupId: string, opts?: { includeLeft?: boolean }) =>
    apiFetch<PanelMember[]>(
      `${base}/${groupId}/members${opts?.includeLeft ? '?include=left' : ''}`,
    ),
  setAccompaniedBy: (groupId: string, membershipId: string, accompaniedBy: string | null) =>
    apiFetch<{ membershipId: string; accompaniedById: string | null }>(
      `${base}/${groupId}/members/${membershipId}/accompanied-by`,
      json('PUT', { accompaniedByMembershipId: accompaniedBy }),
    ),
  bulkMembers: (groupId: string, input: MemberBulkInput) =>
    apiFetch<{ updated: number }>(`${base}/${groupId}/members/bulk`, json('POST', input)),
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
  /** A equipe por papel, o que cada um pode dar e o histórico (Pn-19, #404). */
  staff: (groupId: string) => apiFetch<StaffOverview>(`${base}/${groupId}/staff`),
  /** A tabela "O que cada papel pode fazer". */
  permissions: (groupId: string) => apiFetch<PermissionTable>(`${base}/${groupId}/permissions`),
  /** A especialidade do profissional; Nutrição recorta o que ele recebe. */
  setSpecialty: (groupId: string, membershipId: string, specialty: TeamSpecialty | null) =>
    apiFetch<{ membershipId: string; specialty: TeamSpecialty | null; narrowedLinks: number }>(
      `${base}/${groupId}/members/${membershipId}/specialty`,
      json('PATCH', { specialty }),
    ),

  invites: (groupId: string) => apiFetch<InviteView[]>(`${base}/${groupId}/invites`),
  createInvite: (groupId: string, input: CreateInviteInput) =>
    apiFetch<CreatedInvite>(`${base}/${groupId}/invites`, json('POST', input)),
  createInviteBatch: (
    groupId: string,
    input: {
      emails: string[];
      role: GrantableRole;
      expiresInDays?: number;
      accompaniedByMembershipId?: string;
      giveSeat?: boolean;
    },
  ) => apiFetch<BatchInviteResult>(`${base}/${groupId}/invites/batch`, json('POST', input)),
  revokeInvite: (groupId: string, inviteId: string) =>
    apiFetch<InviteView>(`${base}/${groupId}/invites/${inviteId}`, json('DELETE')),
  resendInvite: (groupId: string, inviteId: string) =>
    apiFetch<CreatedInvite>(`${base}/${groupId}/invites/${inviteId}/resend`, json('POST')),
  invitesOverview: (groupId: string) =>
    apiFetch<InviteOverview>(`${base}/${groupId}/invites/overview`),
  pendingInvites: (groupId: string, query: PendingQuery = {}) => {
    const qs = new URLSearchParams();
    if (query.origin) qs.set('origin', query.origin);
    if (query.q) qs.set('q', query.q);
    if (query.page && query.page > 1) qs.set('page', String(query.page));
    const tail = qs.toString();
    return apiFetch<PendingActivation>(
      `${base}/${groupId}/invites/pending${tail ? `?${tail}` : ''}`,
    );
  },
  resendInvites: (groupId: string, inviteIds: string[]) =>
    apiFetch<ResendManyResult>(`${base}/${groupId}/invites/resend`, json('POST', { inviteIds })),
  /** Convite vencido de novo por 30 dias, com e-mail (Pn-22, "Renovar"). */
  renewInvite: (groupId: string, inviteId: string) =>
    apiFetch<CreatedInvite>(`${base}/${groupId}/invites/${inviteId}/renew`, json('POST')),
  /** Link novo do mesmo convite, sem e-mail: para mandar pelo WhatsApp. */
  freshInviteLink: (groupId: string, inviteId: string) =>
    apiFetch<{ url: string; reused: boolean }>(
      `${base}/${groupId}/invites/${inviteId}/link`,
      json('POST'),
    ),
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
