import type { GroupRole, GroupType, JoinPolicy } from './community';
import type { ShareScope } from './sharing';
import type { TemplateKind, TipCategory } from './community-content';

/**
 * Configurações da comunidade (#413, prancha Pn-15): os textos e as regras
 * iguais na web e no app — seções escondidas, os segmentados de acesso, o que
 * o membro precisa compartilhar e o resumo da equipe.
 *
 * Esconder uma seção é só visual: nunca desliga nada do app do aluno. O
 * registro dele, os planos que já adotou e o histórico continuam.
 */
export type CommunitySection =
  'NUTRITION_TIPS' | 'NUTRITION_PLANS' | 'CHALLENGES' | 'FEED' | 'AGENDA';

export interface CommunitySectionInfo {
  key: CommunitySection;
  label: string;
  /** O que a seção mostra para o membro, embaixo do nome. */
  sub: string;
  /** Ícone do design system (`@fatia/design`). */
  icon: string;
}

/** Na ordem da prancha. A Agenda só tem efeito quando a #397 entrar. */
export const COMMUNITY_SECTIONS: readonly CommunitySectionInfo[] = [
  {
    key: 'NUTRITION_TIPS',
    label: 'Dicas de nutrição',
    sub: 'Planos e dicas › Nutrição',
    icon: 'apple',
  },
  { key: 'NUTRITION_PLANS', label: 'Planos alimentares', sub: 'Adotar alimentação', icon: 'book' },
  { key: 'CHALLENGES', label: 'Desafios', sub: 'aba Desafios e ranking', icon: 'trophy' },
  { key: 'FEED', label: 'Mural', sub: 'posts, enquetes e comunicados no app', icon: 'mega' },
  { key: 'AGENDA', label: 'Agenda', sub: 'aulas e eventos', icon: 'cal' },
];

const ORDER = COMMUNITY_SECTIONS.map((s) => s.key);
const INFO = Object.fromEntries(COMMUNITY_SECTIONS.map((s) => [s.key, s])) as Record<
  CommunitySection,
  CommunitySectionInfo
>;

export const SECTIONS_HINT =
  'Esconde a seção dentro da comunidade. Nunca desliga nada do app do aluno: o registro dele, os planos que já adotou e o histórico continuam.';

/** Sem o campo (API antiga), nada está escondido. */
export function isSectionHidden(
  group: { hiddenSections?: CommunitySection[] | null },
  section: CommunitySection,
): boolean {
  return (group.hiddenSections ?? []).includes(section);
}

/** Liga ou desliga uma seção, sempre na ordem do catálogo (a API devolve na mesma). */
export function toggleSection(
  hidden: readonly CommunitySection[],
  section: CommunitySection,
): CommunitySection[] {
  const next = hidden.includes(section)
    ? hidden.filter((s) => s !== section)
    : [...hidden, section];
  return ORDER.filter((s) => next.includes(s));
}

export function sectionSubtitle(section: CommunitySection, hidden: boolean): string {
  return hidden ? 'escondida para os membros' : INFO[section].sub;
}

export function sectionToast(section: CommunitySection, hidden: boolean): string {
  const nome = INFO[section].label;
  return hidden ? `${nome} escondida · nada some do app do aluno` : `${nome} aparece de novo`;
}

/** Conteúdo do membro sem as dicas de nutrição, quando a seção está escondida. */
export function visibleCommunityTips<T extends { category: TipCategory }>(
  tips: readonly T[],
  hidden: readonly CommunitySection[] | null | undefined,
): T[] {
  return hidden?.includes('NUTRITION_TIPS')
    ? tips.filter((t) => t.category !== 'NUTRITION')
    : [...tips];
}

/** Conteúdo do membro sem os planos alimentares, quando a seção está escondida. */
export function visibleCommunityPlans<T extends { kind: TemplateKind }>(
  plans: readonly T[],
  hidden: readonly CommunitySection[] | null | undefined,
): T[] {
  return hidden?.includes('NUTRITION_PLANS')
    ? plans.filter((p) => p.kind !== 'NUTRITION')
    : [...plans];
}

// ---------------------------------------------------------------- Acesso

export const GROUP_TYPE_OPTIONS: readonly { value: GroupType; label: string }[] = [
  { value: 'SPONSORED', label: 'Patrocinada (paga o PRO)' },
  { value: 'SOCIAL', label: 'Social' },
];

export const VISIBILITY_OPTIONS: readonly { value: 'PUBLIC' | 'PRIVATE'; label: string }[] = [
  { value: 'PUBLIC', label: 'Pública' },
  { value: 'PRIVATE', label: 'Privada' },
];

export const JOIN_POLICY_OPTIONS: readonly { value: JoinPolicy; label: string; hint: string }[] = [
  { value: 'OPEN', label: 'Aberta', hint: 'Qualquer pessoa com o código entra na hora.' },
  {
    value: 'APPROVAL',
    label: 'Com aprovação',
    hint: 'Com o código ou o QR, a pessoa pede e a equipe ou a recepção aprova.',
  },
  { value: 'INVITE_ONLY', label: 'Só convite', hint: 'Só entra quem recebe um convite.' },
];

// ---------------------------------------------------------------- O que o membro compartilha

export const MEAL_PHOTOS_LOCKED = 'Fotos das refeições não pode ser obrigatória';

export const REQUIRED_SCOPES_HINT =
  'Vem marcado e travado na entrada. O resto é escolha de cada um. Vale para quem entrar daqui em diante.';

export const REQUIRED_SCOPE_ITEMS: readonly {
  scope: ShareScope;
  label: string;
  sub: string;
  /** Nunca obrigatória: a API recusa. */
  locked: boolean;
}[] = [
  { scope: 'WORKOUT', label: 'Treino', sub: 'Planos, sessões e volume', locked: false },
  { scope: 'NUTRITION', label: 'Alimentação', sub: 'Refeições e totais do dia', locked: false },
  { scope: 'BODY', label: 'Corpo', sub: 'Peso, medidas e avaliações', locked: false },
  { scope: 'HABITS', label: 'Hábitos', sub: 'Água, passos e hábitos', locked: false },
  { scope: 'GOALS', label: 'Metas', sub: 'Metas e objetivos', locked: false },
  {
    scope: 'MEAL_PHOTOS',
    label: 'Fotos das refeições',
    sub: 'Nunca obrigatória · só quem guarda as fotos',
    locked: true,
  },
];

// ---------------------------------------------------------------- Equipe

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "12 pessoas · 2 donos e admins, 6 profissionais, 4 na recepção". */
export function teamSummaryLabel(counts: Partial<Record<GroupRole, number>>): string {
  const donos = (counts.OWNER ?? 0) + (counts.ADMIN ?? 0);
  const pros = (counts.PROFESSIONAL ?? 0) + (counts.CREATOR ?? 0);
  const recepcao = counts.RECEPTION ?? 0;
  const total = donos + pros + recepcao;
  const partes = [
    donos > 0 ? (counts.ADMIN ? `${donos} donos e admins` : plural(donos, 'dono', 'donos')) : null,
    pros > 0 ? plural(pros, 'profissional', 'profissionais') : null,
    recepcao > 0 ? `${recepcao} na recepção` : null,
  ].filter(Boolean);
  return `${plural(total, 'pessoa', 'pessoas')} · ${partes.join(', ')}`;
}
