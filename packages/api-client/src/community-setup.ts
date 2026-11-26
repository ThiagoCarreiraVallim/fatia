import { checkBrandColor } from '@fatia/design';
import type { GroupKind } from './community-admin';
import type { ChallengeInput, ChallengeKind, ChallengeMetric } from './community-challenges';
import { addDaysToIso } from './community-challenges';
import type { GroupRole, GroupType } from './community';
import type { InviteOrigins, OriginRow } from './month-report';
import { SHARE_SCOPE_LABEL, type ShareScope } from './sharing';
import { apiFetch } from './http';
import { panelHref, type PanelSection } from './community-panel';

/**
 * Onboarding de quem cria a comunidade e do profissional convidado (#372,
 * Onb-C1 a C5, Onb-Criador-Web, Onb-E1 a E3): tipos, rotas e textos iguais na
 * web e no app. As telas só desenham.
 */

// ---------------------------------------------------------------- tipos e rotas

export type SetupItemKey =
  | 'CREATE'
  | 'BRAND'
  | 'CATEGORIES'
  | 'TEAM'
  | 'MEMBERS'
  | 'CHALLENGE'
  | 'PLAN'
  | 'EQUIPMENT'
  | 'ACCESS';

/** Os que se marcam à mão ("Criar" e "Marca" não). */
export type ManualSetupStep = Exclude<SetupItemKey, 'CREATE' | 'BRAND'>;

export interface SetupItemState {
  key: SetupItemKey;
  done: boolean;
  /** Feito pelo dado (convite enviado, desafio marcado…): sem "Desfazer". */
  auto: boolean;
}

export interface CommunitySetup {
  kind: GroupKind | null;
  items: SetupItemState[];
  done: number;
  total: number;
  complete: boolean;
  /** O checklist aparece no topo do painel. */
  visible: boolean;
  /** A marca (passo 2) não foi salva: o painel abre a tela da marca. */
  brandPending: boolean;
}

export interface SlugCheck {
  slug: string;
  /** O endereço do nome já era de outra comunidade; `slug` é o sugerido. */
  taken: boolean;
}

const base = '/api/groups';
const put = (body: unknown) => ({
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const setupApi = {
  get: (groupId: string) => apiFetch<CommunitySetup>(`${base}/${groupId}/setup`),
  setStep: (groupId: string, step: ManualSetupStep, done: boolean) =>
    apiFetch<CommunitySetup>(`${base}/${groupId}/setup/steps/${step}`, put({ done })),
  /** `true` = "Repetir o guia"; `false` = fechar. */
  setGuide: (groupId: string, visible: boolean) =>
    apiFetch<CommunitySetup>(`${base}/${groupId}/setup/guide`, put({ visible })),
  slugCheck: (name: string) =>
    apiFetch<SlugCheck>(`${base}/slug-check?${new URLSearchParams({ name }).toString()}`),
};

// ---------------------------------------------------------------- Onb-C1

/** O domínio curto que aparece antes do slug ("fat.ia.br/academia-demo"). */
export const COMMUNITY_SHORT_HOST = 'fat.ia.br';

export type CommunityKindOption = 'gym' | 'coach' | 'social';

export const COMMUNITY_KIND_OPTIONS: readonly {
  key: CommunityKindOption;
  type: GroupType;
  kind: GroupKind | null;
  title: string;
  sub: string;
  icon: 'dumbbell' | 'user' | 'star';
}[] = [
  {
    key: 'gym',
    type: 'SPONSORED',
    kind: 'GYM',
    title: 'Academia',
    sub: 'Patrocinada: paga o PRO dos alunos · equipe e equipamentos',
    icon: 'dumbbell',
  },
  {
    key: 'coach',
    type: 'SPONSORED',
    kind: 'COACH',
    title: 'Personal ou nutri',
    sub: 'Patrocinada: paga o PRO dos seus alunos',
    icon: 'user',
  },
  {
    key: 'social',
    type: 'SOCIAL',
    kind: null,
    title: 'Influencer ou grupo',
    sub: 'Social: cada membro tem o próprio plano',
    icon: 'star',
  },
];

/**
 * O endereço a partir do nome: minúsculas, sem acento, sem símbolo; curto
 * demais (mínimo 3) ganha "-comunidade". Mesma regra da API (`communitySlug`).
 */
export function communitySlug(name: string): string {
  const b = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  if (!b) return 'comunidade';
  return b.length < 3 ? `${b}-comunidade` : b;
}

/** "Criar" só com o tipo escolhido e um nome de 2 letras ou mais. */
export function canCreateCommunity(kind: CommunityKindOption | null, name: string): boolean {
  return kind !== null && name.trim().length >= 2;
}

// ---------------------------------------------------------------- Onb-C2

/** As cores da Marca, na ordem da prancha. */
export const BRAND_SWATCHES: readonly { color: string; label: string }[] = [
  { color: '#ff7a1a', label: 'Laranja' },
  { color: '#7c5cff', label: 'Roxo' },
  { color: '#ff4d8d', label: 'Rosa' },
  { color: '#00c2b8', label: 'Turquesa' },
  { color: '#f5c400', label: 'Amarelo' },
  { color: '#3d7bff', label: 'Azul' },
];

export interface BrandChoice {
  /** O que vai para a API: a cor, ou o tom corrigido quando ela não passa 4,5:1. */
  color: string | null;
  /** O texto sobre a cor (branco ou escuro). */
  ink: string | null;
  /** Aviso de contraste ou de cor recusada; nulo = "Contraste ok". */
  warning: string | null;
}

/**
 * A cor escolhida na Marca (Onb-C2, ADR 041): passa, ou o editor avisa e usa o
 * tom corrigido (o servidor só aceita 4,5:1). Verde do Fatia é recusado.
 */
export function brandChoice(hex: string): BrandChoice {
  const c = checkBrandColor(hex);
  if (c.status === 'ok') return { color: c.color, ink: c.text, warning: null };
  if (c.status === 'warning') {
    return {
      color: c.suggestion,
      ink: c.suggestionText,
      warning: `Essa cor não dá 4,5:1 nem com texto branco nem com escuro. Usamos ${c.suggestion.toUpperCase()}, um pouco mais escura.`,
    };
  }
  return { color: null, ink: null, warning: c.message };
}

export const BRAND_CONTRAST_OK = 'Contraste ok para texto e botões';

// ---------------------------------------------------------------- checklist

export const SETUP_ITEM_COPY: Record<SetupItemKey, { title: string; sub: string }> = {
  CREATE: { title: 'Nome e tipo', sub: '' },
  BRAND: { title: 'Marca', sub: 'Logo, capa e cor' },
  CATEGORIES: { title: 'Categorias obrigatórias', sub: 'O que todo membro compartilha' },
  TEAM: { title: 'Convidar a equipe', sub: 'Profissionais e nutricionista' },
  MEMBERS: { title: 'Convidar membros', sub: 'Link, QR da recepção ou lista' },
  CHALLENGE: { title: 'Primeiro desafio', sub: 'Modelo Constância 30 dias' },
  PLAN: { title: 'Plano pronto ou dica', sub: 'Publique um plano ou uma dica' },
  EQUIPMENT: { title: 'Equipamentos', sub: 'Filtra exercícios da academia' },
  ACCESS: { title: 'Entrada e quem posta', sub: 'Aberta, com aprovação ou convite' },
};

/** O subtítulo do item com o dado da comunidade ("Academia · fat.ia.br/academia-demo"). */
export function setupItemSub(
  key: SetupItemKey,
  g: {
    slug: string;
    kind: GroupKind | null;
    type: GroupType;
    requiredSharingScopes?: ShareScope[];
  },
): string {
  if (key === 'CREATE') {
    const tipo = COMMUNITY_KIND_OPTIONS.find(
      (o) => o.type === g.type && (g.type === 'SOCIAL' || o.kind === (g.kind ?? 'GYM')),
    );
    return `${tipo?.title ?? 'Comunidade'} · ${COMMUNITY_SHORT_HOST}/${g.slug}`;
  }
  if (key === 'CATEGORIES' && g.requiredSharingScopes?.length) {
    return g.requiredSharingScopes.map((s) => SHARE_SCOPE_LABEL[s]).join(', ');
  }
  return SETUP_ITEM_COPY[key].sub;
}

/** O próximo item a fazer (o destacado na web), ou nulo quando completo. */
export function nextSetupItem(s: Pick<CommunitySetup, 'items'>): SetupItemKey | null {
  return s.items.find((i) => !i.done)?.key ?? null;
}

/** "Comunidade pronta" quando completo; senão "Primeiros passos". */
export function setupHeadline(s: Pick<CommunitySetup, 'complete'>): string {
  return s.complete ? 'Comunidade pronta' : 'Primeiros passos';
}

/** A largura da barra ("33%"). */
export function setupPercent(s: Pick<CommunitySetup, 'done' | 'total'>): string {
  return `${s.total ? Math.round((s.done / s.total) * 100) : 0}%`;
}

/** O botão do item: "Fazer", "Desfazer" (marcado à mão) ou "Feito" (pelo dado). */
export function setupItemAction(i: SetupItemState): 'do' | 'undo' | 'done' {
  if (!i.done) return 'do';
  return i.auto || i.key === 'CREATE' || i.key === 'BRAND' ? 'done' : 'undo';
}

export const SETUP_ACTION_LABEL = { do: 'Fazer', undo: 'Desfazer', done: 'Feito' } as const;

export const SETUP_FOOTER = 'Para ver este guia de novo: menu do seu perfil → Repetir o guia.';

/** Os itens que o app junta numa linha só quando feitos ("Nome e tipo · Marca · Categorias"). */
export const SETUP_FIRST_ITEMS: readonly SetupItemKey[] = ['CREATE', 'BRAND', 'CATEGORIES'];

/** O "1º dez" do relatório: o primeiro dia do mês seguinte. */
export function nextReportLabel(now: Date = new Date()): string {
  const mes = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nome = mes.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return `1º ${nome}`;
}

const SETUP_ITEM_SECTION: Record<Exclude<SetupItemKey, 'BRAND' | 'CHALLENGE'>, PanelSection> = {
  CREATE: 'settings',
  CATEGORIES: 'settings',
  TEAM: 'team',
  MEMBERS: 'invites',
  PLAN: 'content',
  EQUIPMENT: 'exercises',
  ACCESS: 'settings',
};

/** Para onde o "Fazer" do item leva (a marca volta ao passo 2; o desafio, ao modelo). */
export function setupItemHref(groupId: string, key: SetupItemKey): string {
  if (key === 'BRAND') return `/community/new/${groupId}`;
  if (key === 'CHALLENGE') return `${panelHref(groupId, 'challenges')}/first`;
  return panelHref(groupId, SETUP_ITEM_SECTION[key]);
}

/** O sobretítulo do guia no Início: "Comunidade criada hoje"; guia repetido depois de 30 dias, genérico. */
export function setupKicker(createdAt: string, now: Date = new Date()): string {
  const c = new Date(createdAt);
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((dia(now) - dia(c)) / 86_400_000);
  if (dias <= 0) return 'Comunidade criada hoje';
  if (dias === 1) return 'Comunidade criada ontem';
  if (dias <= 30) return `Comunidade criada há ${dias} dias`;
  return 'Guia de primeiros passos';
}

export interface SetupStat {
  key: 'active' | 'review' | 'risk' | 'report';
  label: string;
  value: string;
  sub: string;
}

/**
 * Os 4 cartões do Início (Onb-Criador-Web vazios, Pn-21d cheios). Ativos em 7
 * dias segue a regra dos 5: abaixo disso (ou sem o número, que a API esconde),
 * "aparece com 5 membros".
 */
export function setupStats(input: {
  activeMembers: number;
  active7d: { value: number | null; percent: number | null } | null;
  review: number | null;
  risk: number | null;
  riskDays: number | null;
  /** O relatório ainda não saiu nenhuma vez. */
  first: boolean;
  now?: Date;
}): SetupStat[] {
  const a = input.active7d;
  const ativos =
    input.activeMembers >= INVITE_STAT_MIN && a && a.percent !== null && a.value !== null
      ? { value: `${a.percent}%`, sub: `${a.value} de quem compartilha estatísticas` }
      : { value: '—', sub: 'aparece com 5 membros' };
  const review = input.review ?? 0;
  const risk = input.risk ?? 0;
  return [
    { key: 'active', label: 'Ativos em 7 dias', ...ativos },
    {
      key: 'review',
      label: 'Para revisar',
      value: String(review),
      sub: review ? 'esperando você' : 'treinos dos membros caem aqui',
    },
    {
      key: 'risk',
      label: 'Em risco',
      value: String(risk),
      sub:
        risk && input.riskDays
          ? `sem registro há ${input.riskDays} dias`
          : 'quem sumir aparece aqui',
    },
    {
      key: 'report',
      label: 'Relatório',
      value: nextReportLabel(input.now),
      sub: input.first ? 'primeiro envio' : 'próximo envio',
    },
  ];
}

// ---------------------------------------------------------------- Onb-C5

export interface ChallengeTemplate {
  key: string;
  title: string;
  description: string;
  days: number;
  /** O segundo número do cartão ("1 registro/dia"). */
  rule: { value: string; label: string };
  input: {
    kind?: ChallengeKind;
    metric?: ChallengeMetric;
    waterGoalMl?: number;
    stepsGoal?: number;
  };
}

/** Os modelos prontos para publicar. O primeiro é o da prancha. */
export const CHALLENGE_TEMPLATES: readonly ChallengeTemplate[] = [
  {
    key: 'constancia-30',
    title: 'Constância 30 dias',
    description: 'Conta dias com treino, refeição ou água registrados. Ranking por apelido.',
    days: 30,
    rule: { value: '1', label: 'registro/dia' },
    input: { kind: 'METRIC', metric: 'ACTIVE_DAYS' },
  },
  {
    key: 'treinos-30',
    title: 'Treinos do mês',
    description: 'Quem registrar mais treinos em 30 dias. Ranking por apelido.',
    days: 30,
    rule: { value: '1', label: 'ponto/treino' },
    input: { kind: 'METRIC', metric: 'WORKOUT_SESSIONS' },
  },
  {
    key: 'agua-14',
    title: 'Água em dia',
    description: 'Dias com 2 L de água registrados, por 14 dias.',
    days: 14,
    rule: { value: '2 L', label: 'por dia' },
    input: { kind: 'WATER', waterGoalMl: 2000 },
  },
  {
    key: 'passos-21',
    title: 'Passos 21 dias',
    description: 'Dias com 8 mil passos do celular ou do relógio, por 21 dias.',
    days: 21,
    rule: { value: '8 mil', label: 'passos/dia' },
    input: { kind: 'STEPS', stepsGoal: 8000 },
  },
];

/** A próxima segunda (hoje, se hoje for segunda, conta como "Hoje", então pula 7). */
export function nextMondayIso(today: string): string {
  const [a, m, d] = today.split('-').map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  const falta = (8 - dia) % 7 || 7;
  return addDaysToIso(today, falta);
}

/** "Segunda, 10 nov". */
export function mondayLabel(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  const mes = new Date(Date.UTC(a, m - 1, d))
    .toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' })
    .replace('.', '');
  return `Segunda, ${d} ${mes}`;
}

export function challengeTemplateInput(
  t: ChallengeTemplate,
  startDate: string,
  notify: boolean,
): ChallengeInput {
  return {
    title: t.title,
    description: t.description,
    ...t.input,
    startDate,
    endDate: addDaysToIso(startDate, t.days - 1),
    notify,
  };
}

/** O texto do "Desafio publicado". */
export function challengePublishedText(
  t: Pick<ChallengeTemplate, 'title'>,
  startLabel: string,
  notify: boolean,
): string {
  return `${t.title} começa ${startLabel}. ${
    notify ? 'Todos os membros recebem o aviso.' : 'Sem aviso por push.'
  }`;
}

// ---------------------------------------------------------------- Onb-C4

export type InviteMode = 'link' | 'qr' | 'list';

/** A regra dos 5 (MIN_CELL): abaixo disso, a contagem não sai. */
export const INVITE_STAT_MIN = 5;

export const INVITE_SMALL_SAMPLE = 'Amostra pequena demais para mostrar · aparece com 5 pessoas';

/**
 * "entraram / ativaram" do modo aberto, das Origens (#400): o QR pelo nome, o
 * link e a lista pelo tipo. Nulo = amostra pequena (a API já suprime abaixo de 5).
 */
export function inviteModeStat(
  origins: InviteOrigins | undefined,
  mode: InviteMode,
  qrName: string,
): { joined: number; activated: number | null } | null {
  if (!origins) return null;
  const nome = qrName.trim().toLowerCase();
  const rows: OriginRow[] = origins.rows.filter((r) =>
    mode === 'qr'
      ? r.kind === 'qr' && (r.label ?? '').trim().toLowerCase() === nome
      : mode === 'link'
        ? r.kind === 'link'
        : r.kind === 'list' || r.kind === 'email',
  );
  const joined = rows.reduce((t, r) => t + (r.joined ?? 0), 0);
  if (joined < INVITE_STAT_MIN || rows.some((r) => r.joined === null)) return null;
  const act = rows.every((r) => r.activated !== null)
    ? rows.reduce((t, r) => t + (r.activated ?? 0), 0)
    : null;
  return { joined, activated: act };
}

/** O título do cartão de contagem ("QR · recepção", "Link da bio", "Lista de e-mails"). */
export function inviteModeTitle(mode: InviteMode, qrName: string): string {
  if (mode === 'qr') return `QR · ${qrName.trim() || 'sem nome'}`;
  return mode === 'link' ? 'Link da bio' : 'Lista de e-mails';
}

/** E-mails de uma colagem (um por linha, ou a coluna da planilha), sem repetir. */
export function emailsFromPaste(text: string): string[] {
  const achados = text.match(/[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/g) ?? [];
  return [...new Set(achados.map((e) => e.toLowerCase()))];
}

// ---------------------------------------------------------------- Onb-E1, E2, E3

/** O que cada papel da equipe recebe, no convite (Onb-E1). */
export const TEAM_INVITE_ROLE: Partial<
  Record<GroupRole, { title: string; sub: string; permissions: string[] }>
> = {
  PROFESSIONAL: {
    title: 'Profissional',
    sub: 'Instrutor, personal ou nutricionista',
    permissions: [
      'Ficha dos seus alunos',
      'Publicar planos, dicas e desafios',
      'Para revisar e alunos em risco',
    ],
  },
  ADMIN: {
    title: 'Administrador',
    sub: 'Cuida da comunidade com o dono',
    permissions: ['Membros, convites e aprovações', 'Mural, avisos e desafios', 'Configurações'],
  },
  CREATOR: {
    title: 'Criador',
    sub: 'Publica conteúdo para a comunidade',
    permissions: ['Publicar planos e dicas', 'Desafios', 'Mural'],
  },
  RECEPTION: {
    title: 'Recepção',
    sub: 'O balcão da academia',
    permissions: ['Nome e situação de cada membro', 'Aprovar quem chega', 'Check-in'],
  },
};

export function isTeamInvite(role: GroupRole): boolean {
  return role !== 'MEMBER' && role !== 'OWNER';
}

/** "Bruno te convidou para a equipe". */
export function teamInviteHeadline(invitedBy: string | null): string {
  const quem = invitedBy?.trim().split(/\s+/)[0];
  return quem ? `${quem} te convidou para a equipe` : 'Você foi convidado para a equipe';
}

/** "O Bruno vai ver que você recusou." */
export function teamInviteDeclinedText(invitedBy: string | null): string {
  const quem = invitedBy?.trim().split(/\s+/)[0];
  return `${quem ? `${quem} vai ver` : 'Quem convidou vai ver'} que você recusou. Se mudar de ideia, peça um novo convite.`;
}

/** As 5 categorias do "O que você vê" (Onb-E2), na ordem da prancha. */
export const WHAT_YOU_SEE_SCOPES: readonly ShareScope[] = [
  'WORKOUT',
  'NUTRITION',
  'BODY',
  'HABITS',
  'GOALS',
];

/** "treino", "alimentação · bloqueado"… do que o aluno liberou para você. */
export function sharedCategories(
  granted: readonly ShareScope[],
): { label: string; shared: boolean }[] {
  return WHAT_YOU_SEE_SCOPES.map((s) => {
    const shared = granted.includes(s);
    const nome = SHARE_SCOPE_LABEL[s].toLowerCase();
    return { label: shared ? nome : `${nome} · bloqueado`, shared };
  });
}

/** As notas do "O que você vê": o registro do acesso leva o primeiro nome de quem abre. */
export function whatYouSeeNotes(
  myName: string | null,
): { icon: 'eye' | 'chart'; title: string; body: string }[] {
  const quem = myName?.trim().split(/\s+/)[0] || 'Você';
  return [
    {
      icon: 'eye',
      title: 'Cada acesso fica registrado',
      body: `O aluno vê "${quem} abriu sua ficha · 09:12"`,
    },
    {
      icon: 'chart',
      title: 'Números da comunidade são só agregados',
      body: 'Contam só quem aceitou entrar nas estatísticas, nunca com nome',
    },
  ];
}

/** As 2 dicas de primeiro uso do Para revisar (Onb-E3). */
export const REVIEW_TIPS: readonly { title: string; body: string }[] = [
  {
    title: 'Abra a ficha do aluno',
    body: 'Na ficha você envia treino, dieta ou avaliação e fala pelo WhatsApp.',
  },
  { title: 'Visto tira da lista', body: 'O aluno não é avisado. Comentar fica dentro da ficha.' },
];

/** A chave de preferência de UI: as dicas já vistas não voltam neste aparelho. */
export const REVIEW_TIPS_SEEN_KEY = 'fatia:review-tips-seen:v1';
