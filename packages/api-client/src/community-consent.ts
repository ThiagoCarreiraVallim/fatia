import { ApiError } from './http';
import type {
  GroupRole,
  JoinPolicy,
  MembershipChange,
  MembershipStatus,
  TeamMember,
} from './community';
import { SHARE_SCOPE_LABEL, type ShareScope } from './sharing';

/**
 * Textos e regras da tela de consentimento ao entrar numa comunidade (ADR 026),
 * iguais na web e no app.
 */

/** A ordem em que as categorias aparecem, e a do enum na API. */
export const SHARE_SCOPES: readonly ShareScope[] = [
  'WORKOUT',
  'NUTRITION',
  'BODY',
  'HABITS',
  'GOALS',
];

/** O que a equipe passa a ver em cada categoria — o mesmo que o painel dela lê. */
export const SCOPE_DETAILS: Record<ShareScope, string> = {
  WORKOUT: 'Planos, sessões e volume de treino',
  NUTRITION: 'Refeições e totais de cada dia',
  BODY: 'Pesagens e a evolução do peso',
  HABITS: 'Água e passos de cada dia',
  GOALS: 'Suas metas pessoais e o andamento delas',
};

const ROLE_LABEL: Record<GroupRole, string> = {
  OWNER: 'Dono',
  PROFESSIONAL: 'Profissional',
  CREATOR: 'Criador de conteúdo',
  MEMBER: 'Membro',
};

export function teamRoleLabel(role: GroupRole): string {
  return ROLE_LABEL[role];
}

const JOIN_POLICY_LABEL: Record<JoinPolicy, string> = {
  OPEN: 'Entrada livre',
  APPROVAL: 'Entrada com aprovação do dono',
  INVITE_ONLY: 'Só por convite',
};

export function joinPolicyLabel(policy: JoinPolicy): string {
  return JOIN_POLICY_LABEL[policy];
}

/** Liga ou desliga uma categoria, devolvendo a lista na ordem canônica. */
export function toggleScope(scopes: readonly ShareScope[], scope: ShareScope): ShareScope[] {
  const next = new Set(scopes);
  if (next.has(scope)) next.delete(scope);
  else next.add(scope);
  return SHARE_SCOPES.filter((s) => next.has(s));
}

function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/** O aviso ao lado de um escopo que a comunidade exige. */
export const REQUIRED_SCOPE_NOTE = 'Obrigatório nesta comunidade';

/**
 * Os escopos que aparecem marcados e travados na tela de consentimento: os
 * obrigatórios que a pessoa compartilha (ou passa a compartilhar ao entrar).
 *
 * Ao entrar, `current` são os próprios obrigatórios — vêm marcados. Ao editar,
 * só trava o que já se compartilha: quem entrou antes de o dono exigir algo
 * não deve o que nunca deu, e a API recusa do mesmo jeito.
 */
export function lockedScopes(
  required: readonly ShareScope[],
  current: readonly ShareScope[],
): ShareScope[] {
  return SHARE_SCOPES.filter((s) => required.includes(s) && current.includes(s));
}

/** "Treino, Alimentação e Metas", ou "Nada" quando a pessoa não compartilha nada. */
export function consentSummary(scopes: readonly ShareScope[]): string {
  const labels = SHARE_SCOPES.filter((s) => scopes.includes(s)).map((s) => SHARE_SCOPE_LABEL[s]);
  return labels.length === 0 ? 'Nada' : joinWithAnd(labels);
}

/** "Ana (dono) e Bruno (profissional)": quem recebe o que a pessoa marcar. */
export function whoSees(team: readonly TeamMember[]): string {
  const equipe = team.filter((m) => m.role !== 'MEMBER');
  if (equipe.length === 0) return 'Ninguém da equipe, por enquanto';
  return joinWithAnd(equipe.map((m) => `${m.name} (${ROLE_LABEL[m.role].toLowerCase()})`));
}

/** O selo da associação na lista "Minhas comunidades". `null` = ativa, sem selo. */
export function membershipBadge(status: MembershipStatus): string | null {
  return status === 'INVITED' ? 'Aguardando aprovação' : null;
}

/** O que dizer depois de entrar: ativo vai direto; com aprovação, avisa que espera o dono. */
export function joinResultMessage(result: Pick<MembershipChange, 'status'>): string {
  return result.status === 'ACTIVE'
    ? 'Você entrou na comunidade.'
    : 'Pedido enviado. Você entra quando o dono aprovar.';
}

/**
 * Aceitar um convite de quem já é membro dá 409 com o `groupId`: a tela leva a
 * pessoa à comunidade em vez de mostrar erro.
 */
export function alreadyMemberGroupId(err: unknown): string | null {
  if (!(err instanceof ApiError) || !err.isConflict) return null;
  const body = err.body as { groupId?: unknown } | undefined;
  return typeof body?.groupId === 'string' ? body.groupId : null;
}
