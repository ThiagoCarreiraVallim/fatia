import { apiFetch } from './http';
import type { PostPolicy } from './community-feed';
import type { ShareScope } from './sharing';

/**
 * Comunidades do lado do membro (ADR 025/026): minhas comunidades, entrar por
 * código ou convite com o consentimento escolhido, mudar o que compartilho e sair.
 *
 * Criar comunidade, convidar e mexer em assento são do painel da equipe (Fase 6)
 * e não moram aqui.
 */

export type GroupType = 'SPONSORED' | 'SOCIAL';
export type GroupRole = 'OWNER' | 'ADMIN' | 'PROFESSIONAL' | 'CREATOR' | 'RECEPTION' | 'MEMBER';
/** A especialidade de quem é profissional (#404). Nutrição recorta o que recebe. */
export type TeamSpecialty = 'TRAINING' | 'NUTRITION' | 'PHYSIO' | 'OTHER';
/**
 * As ações administrativas do papel, como a API decide (`docs/PERMISSIONS.md`).
 * A tela só esconde o que a API já recusaria.
 */
export type GroupAction =
  | 'group.read'
  | 'group.update'
  | 'group.delete'
  | 'group.transfer'
  | 'group.sharing'
  | 'member.grant_reader'
  | 'invite.create'
  | 'invite.revoke'
  | 'member.list'
  | 'member.approve'
  | 'member.remove'
  | 'member.role'
  | 'member.assign'
  | 'billing.read'
  | 'billing.manage'
  | 'content.publish'
  | 'content.read'
  | 'content.moderate'
  | 'offer.create'
  | 'challenge.manage'
  | 'challenge.join'
  | 'challenge.review'
  | 'post.read'
  | 'post.create'
  | 'announcement.publish'
  | 'member.ban'
  | 'insights.read'
  | 'panel.overview'
  | 'panel.search'
  | 'member.file'
  | 'member.plans'
  | 'member.note'
  | 'panel.review'
  | 'benefit.read'
  | 'benefit.manage';
export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'LEFT' | 'REMOVED' | 'BANNED';
export type JoinPolicy = 'OPEN' | 'APPROVAL' | 'INVITE_ONLY';
/** Igual a `GroupVisibility` do painel (`community-admin.ts`). */
type Visibility = 'PUBLIC' | 'PRIVATE';

/** O que a pessoa escolhe ao entrar: nada vem marcado, e recusar tudo ainda entra. */
export interface JoinConsent {
  scopes: ShareScope[];
  /** Entrar nas estatísticas agregadas da comunidade, sem identificação. */
  statsOptIn: boolean;
}

/** Uma comunidade da qual a pessoa faz parte (ou pediu para entrar), do ponto de vista dela. */
export interface MyGroup {
  id: string;
  type: GroupType;
  name: string;
  slug: string;
  description: string | null;
  joinPolicy: JoinPolicy;
  /** O papel de quem pergunta, nunca o de outra pessoa. */
  role: GroupRole;
  status: MembershipStatus;
  membershipId: string;
  joinedAt: string | null;
  createdAt: string;
  consentScopes: ShareScope[];
  statsOptIn: boolean;
  /** A comunidade paga o PRO desta pessoa. */
  hasAiSeat: boolean;
  /**
   * O PRO valendo agora é pago por esta comunidade (assinatura própria vence o
   * assento). É o selo "PRO pago pela academia" e o "se sair, volta ao Free".
   */
  proPaidByThisGroup: boolean;
  /** Avatar da comunidade, URL assinada de curta duração. */
  avatarUrl: string | null;
  /** Quem publica no mural (Fase 8b). */
  postPolicy: PostPolicy;
  /** O que a comunidade exige que membros compartilhem (vale para quem entra como membro). */
  requiredSharingScopes: ShareScope[];
  /** Os posts automáticos ligados (#394). */
  autoPosts?: ('PLAN' | 'TIP' | 'EXERCISE' | 'CHALLENGE')[];
  visibility: Visibility;
  /** Fuso da comunidade (IANA). */
  timezone: string;
  /** Pessoas ativas. */
  memberCount: number;
  /** Posts dos outros desde a última visita ao mural. */
  newPostCount: number;
  /** O que a equipe mandou e espera resposta ("3 para você"). */
  forYouCount: number;
  /** A posição no desafio em andamento em que a pessoa entrou. */
  challenge: { id: string; title: string; rank: number } | null;
  /** O que o papel de quem pergunta pode fazer aqui (#404). Ausente em API antiga. */
  actions?: GroupAction[];
  /** A especialidade, quando quem pergunta é profissional. */
  specialty?: TeamSpecialty | null;
  /** Profissionais veem só quem acompanham (#404). */
  proSeeOnlyAssigned?: boolean;
}

/**
 * O que cada papel faz, espelho de `docs/PERMISSIONS.md` para quando a API
 * ainda não mandou `actions` (resposta antiga em cache). Um teste confere com
 * a doc; a API continua sendo o portão.
 */
export const ROLE_ACTIONS: Record<GroupRole, readonly GroupAction[]> = {
  OWNER: [
    'group.read',
    'group.update',
    'group.delete',
    'group.transfer',
    'group.sharing',
    'member.grant_reader',
    'invite.create',
    'invite.revoke',
    'member.list',
    'member.approve',
    'member.remove',
    'member.role',
    'member.assign',
    'billing.read',
    'billing.manage',
    'content.publish',
    'content.read',
    'content.moderate',
    'challenge.manage',
    'challenge.join',
    'challenge.review',
    'post.read',
    'post.create',
    'announcement.publish',
    'member.ban',
    'insights.read',
    'panel.overview',
    'panel.search',
    'member.file',
    'member.plans',
    'member.note',
    'panel.review',
    'benefit.read',
    'benefit.manage',
  ],
  ADMIN: [
    'group.read',
    'group.update',
    'invite.create',
    'invite.revoke',
    'member.list',
    'member.approve',
    'member.remove',
    'member.role',
    'member.assign',
    'content.publish',
    'content.read',
    'content.moderate',
    'challenge.manage',
    'challenge.join',
    'challenge.review',
    'post.read',
    'post.create',
    'announcement.publish',
    'member.ban',
    'panel.overview',
    'panel.search',
    'benefit.read',
  ],
  PROFESSIONAL: [
    'group.read',
    'invite.create',
    'invite.revoke',
    'member.list',
    'content.publish',
    'content.read',
    'offer.create',
    'challenge.manage',
    'challenge.join',
    'challenge.review',
    'post.read',
    'post.create',
    'announcement.publish',
    'panel.overview',
    'panel.search',
    'member.file',
    'member.plans',
    'member.note',
    'panel.review',
    'benefit.read',
  ],
  CREATOR: [
    'group.read',
    'member.list',
    'content.publish',
    'content.read',
    'challenge.manage',
    'challenge.join',
    'challenge.review',
    'post.read',
    'post.create',
    'benefit.read',
  ],
  RECEPTION: [
    'group.read',
    'member.list',
    'member.approve',
    'content.read',
    'challenge.join',
    'post.read',
    'post.create',
    'announcement.publish',
    'panel.overview',
    'panel.search',
    'benefit.read',
  ],
  MEMBER: [
    'group.read',
    'member.list',
    'content.read',
    'challenge.join',
    'post.read',
    'post.create',
    'benefit.read',
  ],
};

/** O papel de quem pergunta faz isto? Sem `actions` (API antiga), pelo espelho da matriz. */
export function groupCan(group: Pick<MyGroup, 'role' | 'actions'>, action: GroupAction): boolean {
  return (group.actions ?? ROLE_ACTIONS[group.role]).includes(action);
}

/** Uma pessoa da equipe vista pelo membro (Cm-04): o que vê dele e quando olhou. */
export interface TeamMemberView {
  name: string;
  role: GroupRole;
  specialty?: TeamSpecialty | null;
  /** É quem acompanha a pessoa nesta comunidade. */
  accompaniesMe?: boolean;
  sees: ShareScope[];
  lastViewedAt: string | null;
}

/** Quem da equipe recebe o que a pessoa compartilhar. Só nome e papel. */
export interface TeamMember {
  name: string;
  role: GroupRole;
}

/** `GET /groups/preview?code=`: a comunidade antes de entrar pelo código (ou slug). */
export interface GroupPreview {
  id: string;
  type: GroupType;
  name: string;
  /** O que mandar de volta em `join`: o código normalizado, ou o slug de comunidade pública. */
  code: string;
  memberCount: number;
  description: string | null;
  joinPolicy: JoinPolicy;
  visibility: Visibility;
  team: TeamMember[];
  /** O que é obrigatório compartilhar para entrar pelo código. */
  requiredSharingScopes: ShareScope[];
  /** `ALL_MEMBERS` libera; `SEATS` com vaga pode liberar; `null` sem oferta (`proOfferNote`). */
  proOffer: 'ALL_MEMBERS' | 'SEATS' | null;
}

/** `GET /groups/invites/:token`, sem login: o cartão do convite. */
export interface InvitePreview {
  group: { id: string; name: string; description: string | null; type: GroupType };
  role: GroupRole;
  invitedBy: string | null;
  team: TeamMember[];
  memberCount: number;
  /** O convite foi para um e-mail: só a conta com esse e-mail aceita. */
  emailBound: boolean;
  /** Nulo = sem prazo (link ou QR, #401). */
  expiresAt: string | null;
  /** O que é obrigatório compartilhar para entrar por este convite; vazio em convite de equipe. */
  requiredSharingScopes: ShareScope[];
  /** O desafio em andamento, para as boas-vindas (Onb-02): título e quantos participam. */
  activeChallenge: { title: string; participants: number } | null;
}

/** Resposta de entrar, aceitar ou sair. `INVITED` = aguardando o dono aprovar. */
export interface MembershipChange {
  membershipId: string;
  groupId: string;
  status: MembershipStatus;
  role: GroupRole;
  revokedLinks: number;
}

export interface GroupConsent {
  groupId: string;
  scopes: ShareScope[];
  statsOptIn: boolean;
  consentAt: string;
}

/** Uma pessoa na lista de membros, como a API mostra a quem pergunta. */
export interface GroupMember {
  membershipId: string;
  name: string;
  role: GroupRole;
  status: MembershipStatus;
  joinedAt: string | null;
}

/** Uma linha de "quem olhou meu dado": tentativas barradas aparecem também. */
export interface AccessLogEntry {
  at: string;
  action: string;
  /** `null` na abertura da ficha pela equipe (#402): abrir não lê categoria. */
  scope: ShareScope | null;
  denied: boolean;
  /** `null` se a conta de quem olhou já não existe. */
  professionalName: string | null;
  /** O papel de quem olhou na comunidade (#404). */
  professionalRole?: GroupRole | null;
  groupId: string | null;
}

const base = '/api/groups';

export const groupsApi = {
  mine: () => apiFetch<MyGroup[]>(base),
  get: (groupId: string) => apiFetch<MyGroup>(`${base}/${groupId}`),
  members: (groupId: string) => apiFetch<GroupMember[]>(`${base}/${groupId}/members`),
  /** Pelo código legível da equipe ou pelo slug (#393). Inválido e só por convite: 404. */
  previewByCode: (code: string) =>
    apiFetch<GroupPreview>(`${base}/preview?code=${encodeURIComponent(code)}`),
  /** `code` é o `GroupPreview.code`. Segue a forma de entrada: aprovação vira pedido. */
  join: (code: string, consent: JoinConsent) =>
    apiFetch<MembershipChange>(`${base}/join`, {
      method: 'POST',
      body: JSON.stringify({ code, ...consent }),
    }),
  /** A equipe vista por quem pergunta (Cm-04): o que cada um vê e quando olhou. */
  team: (groupId: string) => apiFetch<TeamMemberView[]>(`${base}/${groupId}/team`),
  leave: (groupId: string) =>
    apiFetch<MembershipChange>(`${base}/${groupId}/members/me`, { method: 'DELETE' }),
  /** Reescreve o que compartilho com a equipe desta comunidade; `[]` tira o acesso de todos. */
  setConsent: (groupId: string, consent: JoinConsent) =>
    apiFetch<GroupConsent>(`${base}/${groupId}/consent`, {
      method: 'PUT',
      body: JSON.stringify(consent),
    }),
  previewInvite: (token: string) =>
    apiFetch<InvitePreview>(`${base}/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string, consent: JoinConsent) =>
    apiFetch<MembershipChange>(`${base}/invites/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      body: JSON.stringify(consent),
    }),
  /** O registro de acessos da própria pessoa, filtrado pela comunidade quando vem `groupId`. */
  accessLog: (params: { groupId?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.groupId) q.set('groupId', params.groupId);
    if (params.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return apiFetch<AccessLogEntry[]>(`/api/sharing/access-log${qs ? `?${qs}` : ''}`);
  },
};
