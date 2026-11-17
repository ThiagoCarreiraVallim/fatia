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
export type GroupRole = 'OWNER' | 'PROFESSIONAL' | 'CREATOR' | 'MEMBER';
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
  /** Avatar da comunidade, URL assinada de curta duração. */
  avatarUrl: string | null;
  /** Quem publica no mural (Fase 8b). */
  postPolicy: PostPolicy;
  /** O que a comunidade exige que membros compartilhem (vale para quem entra como membro). */
  requiredSharingScopes: ShareScope[];
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
}

/** Uma pessoa da equipe vista pelo membro (Cm-04): o que vê dele e quando olhou. */
export interface TeamMemberView {
  name: string;
  role: GroupRole;
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
  slug: string;
  /** O que mandar de volta em `join`: o código normalizado ou o slug. */
  code: string;
  memberCount: number;
  description: string | null;
  joinPolicy: JoinPolicy;
  visibility: Visibility;
  team: TeamMember[];
  /** O que é obrigatório compartilhar para entrar pelo código. */
  requiredSharingScopes: ShareScope[];
  /** A comunidade tem assento livre (ou dá a todos): "A academia libera o PRO". */
  proOffer: boolean;
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
  expiresAt: string;
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
  scope: ShareScope;
  denied: boolean;
  /** `null` se a conta de quem olhou já não existe. */
  professionalName: string | null;
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
