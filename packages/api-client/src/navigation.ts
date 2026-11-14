/**
 * Navegação comum ao PWA e ao app: a mesma barra e o mesmo conteúdo de Você
 * nas duas pontas (ADR 040, revisada em 2026-11).
 *
 * Barra de baixo: cinco abas só de ícone — Hoje · Nutrição · Treino ·
 * Comunidade · Você — e, separado delas, o botão redondo da IA, que abre o
 * menu "O que vamos registrar?" (`ai-drawer.ts`). No desktop do PWA a barra
 * lateral mostra as mesmas cinco abas com o botão da IA no topo.
 *
 * O Hoje é a raiz. Toda outra tela tem a barra de topo com "voltar" e o título
 * pequeno, como no iOS, e voltar sobe pelo mapa de rotas (`ROUTES`) até a aba
 * dona da tela e daí ao Hoje — não pelo histórico, então um link aberto direto
 * também volta pelo caminho certo.
 */

export type NavPlatform = 'web' | 'mobile';
export type NavKey = 'today' | 'nutrition' | 'workout' | 'community' | 'you';

/**
 * Ícone de cada aba, pelo nome do design system (`@fatia/design`, `ICONS`).
 * `avatar` não é ícone: a aba Você mostra a inicial da pessoa.
 */
export type NavTabIcon = 'home' | 'apple' | 'dumbbell' | 'users' | 'avatar';

export interface NavTab {
  key: NavKey;
  /** A barra só mostra o ícone; o nome é do leitor de tela (`aria-label`). */
  label: string;
  href: string;
  icon: NavTabIcon;
}

export const PRIMARY_TABS: NavTab[] = [
  { key: 'today', label: 'Hoje', href: '/', icon: 'home' },
  { key: 'nutrition', label: 'Nutrição', href: '/nutrition', icon: 'apple' },
  { key: 'workout', label: 'Treino', href: '/workout', icon: 'dumbbell' },
  { key: 'community', label: 'Comunidade', href: '/community', icon: 'users' },
  { key: 'you', label: 'Você', href: '/you', icon: 'avatar' },
];

export type MenuIcon =
  | 'progress'
  | 'records'
  | 'daily-goals'
  | 'personal-goals'
  | 'profile'
  | 'notifications'
  | 'foods'
  | 'nutrients'
  | 'plans'
  | 'history'
  | 'chat'
  | 'connect'
  | 'plan';

export interface MenuItem {
  key: MenuIcon;
  label: string;
  description: string;
  href: string;
  /** Função do plano PRO que esta pessoa não tem: mostra cadeado e leva ao plano. */
  locked?: boolean;
}

interface MenuItemDef extends Omit<MenuItem, 'href'> {
  href: string | Record<NavPlatform, string>;
  /** Ausente = as duas pontas. */
  platforms?: NavPlatform[];
  /**
   * Só aparece quando a instância tem a IA hospedada; no Free (ADR 024) aparece
   * com cadeado e leva ao "Meu plano".
   */
  requires?: 'chat';
}

export interface MenuSection {
  title: string;
  items: MenuItem[];
}

const MENU: { title: string; items: MenuItemDef[] }[] = [
  {
    title: 'Você',
    items: [
      {
        key: 'progress',
        label: 'Progresso',
        description: 'Peso, gráficos e consistência',
        href: '/progress',
      },
      {
        key: 'daily-goals',
        label: 'Metas do dia',
        description: 'Calorias, macros, água, passos e treinos',
        href: '/nutrition/goals',
      },
      {
        key: 'personal-goals',
        label: 'Metas pessoais',
        description: 'Peso-alvo e objetivos com prazo',
        href: '/goals',
      },
      {
        key: 'records',
        label: 'Recordes',
        description: 'Suas melhores marcas',
        href: '/progress/records',
      },
      {
        key: 'profile',
        label: 'Perfil',
        description: 'Conta, altura e seus dados',
        href: '/profile',
      },
      // Os avisos são uma linha de Você, não um sino no cabeçalho dela (ADR 040,
      // item 4). Leva às preferências até a caixa de avisos da #389.
      {
        key: 'notifications',
        label: 'Notificações',
        description: 'Avisos e lembretes',
        href: '/profile/notifications',
      },
    ],
  },
  {
    title: 'Registros',
    items: [
      {
        key: 'foods',
        label: 'Meus alimentos',
        description: 'O que você cadastrou',
        href: '/nutrition/foods',
      },
      {
        key: 'nutrients',
        label: 'Metas de nutrientes',
        description: 'Fibra, sódio, açúcar e outros',
        href: '/nutrition/nutrient-targets',
      },
      {
        key: 'plans',
        label: 'Planos de treino',
        description: 'Seus treinos montados',
        href: '/workout/plans',
      },
      {
        key: 'history',
        label: 'Histórico de treino',
        description: 'Treinos já feitos',
        href: '/workout/history',
      },
    ],
  },
  {
    title: 'IA',
    items: [
      {
        key: 'chat',
        label: 'Chat com a IA',
        description: 'Pergunte e registre conversando',
        href: '/chat',
        requires: 'chat',
      },
      {
        key: 'connect',
        label: 'Conectar sua IA',
        description: 'Use o Claude ou outra IA com seus dados',
        href: { web: '/profile/connect', mobile: '/profile/tokens' },
      },
      {
        key: 'plan',
        label: 'Meu plano',
        description: 'Free ou PRO, e a IA do Fatia',
        href: '/plan',
      },
    ],
  },
];

export function menuSections(opts: {
  platform: NavPlatform;
  chatAvailable: boolean;
  /** A instância tem o chat, mas ele é do PRO e a pessoa é Free. */
  chatLocked?: boolean;
}): MenuSection[] {
  return MENU.map((section) => ({
    title: section.title,
    items: section.items
      .filter((item) => !item.platforms || item.platforms.includes(opts.platform))
      .filter((item) => item.requires !== 'chat' || opts.chatAvailable)
      .map(({ platforms: _p, requires, ...item }) => {
        const href = typeof item.href === 'string' ? item.href : item.href[opts.platform];
        return requires === 'chat' && opts.chatLocked
          ? { ...item, href: '/plan?recurso=chat', locked: true }
          : { ...item, href };
      }),
  })).filter((section) => section.items.length > 0);
}

/**
 * Aba acesa para a rota. Cada aba acende em toda a sua subárvore (Meus
 * alimentos é Nutrição, Planos é Treino). Perfil, Progresso, Metas pessoais e
 * Meu plano moram em Você; o painel da equipe (`/org`) e a área do
 * profissional (`/students`) moram em Comunidade. O chat não é de aba nenhuma:
 * `null`.
 */
export function activeNavKey(pathname: string): NavKey | null {
  const path = pathname.split(/[?#]/)[0]!;
  if (path === '/' || path === '') return 'today';
  const under = (root: string) => new RegExp(`^/${root}(/|$)`).test(path);
  if (under('nutrition')) return 'nutrition';
  if (under('workout')) return 'workout';
  if (under('community') || under('org') || under('students')) return 'community';
  if (under('you') || under('profile') || under('progress') || under('goals') || under('plan')) {
    return 'you';
  }
  return null;
}

/**
 * Tarefas de foco: a barra de baixo some (ADR 040, item 6). Conversa aberta,
 * câmera, leitor de código, criar comunidade, onboarding e os editores do
 * painel. Os padrões casam a rota inteira, com os `:param`.
 */
const FOCUS_ROUTES = [
  '/chat',
  '/chat/:id',
  '/nutrition/photo',
  '/nutrition/scan',
  '/community/new',
  '/onboarding',
  '/org/:id/content/plans/:templateId',
  '/org/:id/content/tips/:tipId',
  '/org/:id/exercises/:exerciseId',
] as const;

export type NavBarMode = 'visible' | 'hidden';

/**
 * A barra aparece nesta tela? A sessão de treino só esconde enquanto está em
 * andamento: concluída, ela é tela de ver. `activeSessionId` ausente é "ainda
 * não sei", e a barra fica escondida até saber, para não piscar sobre a sessão.
 */
export function navBarMode(
  pathname: string,
  opts: { activeSessionId?: string | null } = {},
): NavBarMode {
  const path = segments(pathname);
  if (FOCUS_ROUTES.some((pattern) => match(pattern, path))) return 'hidden';
  if (match('/workout/session/:id', path)) {
    if (opts.activeSessionId === undefined) return 'hidden';
    return opts.activeSessionId === path[2] ? 'hidden' : 'visible';
  }
  return 'visible';
}

/** Uma tela no mapa: o título pequeno da barra de topo e para onde "voltar" leva. */
interface RouteDef {
  /** Segmentos com `:param` para os dinâmicos. */
  pattern: string;
  title: string;
  /** null só no Hoje. */
  parent: string | null;
}

export const HOME_TITLE = 'Hoje';

/**
 * Todas as telas do PWA e do app. Telas dinâmicas têm título genérico; a
 * própria tela troca pelo nome (plano, conversa, comunidade) quando carrega.
 */
export const ROUTES: readonly RouteDef[] = [
  { pattern: '/', title: HOME_TITLE, parent: null },
  { pattern: '/nutrition', title: 'Nutrição', parent: '/' },
  { pattern: '/nutrition/foods', title: 'Meus alimentos', parent: '/nutrition' },
  { pattern: '/nutrition/goals', title: 'Metas do dia', parent: '/nutrition' },
  { pattern: '/nutrition/nutrient-targets', title: 'Metas de nutrientes', parent: '/nutrition' },
  { pattern: '/nutrition/scan', title: 'Escanear produto', parent: '/nutrition' },
  { pattern: '/nutrition/photo', title: 'Registrar por foto', parent: '/nutrition' },
  { pattern: '/workout', title: 'Treino', parent: '/' },
  { pattern: '/workout/history', title: 'Histórico de treino', parent: '/workout' },
  { pattern: '/workout/plans', title: 'Planos de treino', parent: '/workout' },
  { pattern: '/workout/plans/:id', title: 'Plano de treino', parent: '/workout/plans' },
  { pattern: '/workout/quick/:id', title: 'Treino rápido', parent: '/workout' },
  { pattern: '/workout/session/:id', title: 'Treino', parent: '/workout/history' },
  // Você: a quinta aba. Perfil, Progresso, Metas pessoais e Meu plano são dela.
  { pattern: '/you', title: 'Você', parent: '/' },
  { pattern: '/progress', title: 'Progresso', parent: '/you' },
  { pattern: '/progress/records', title: 'Recordes', parent: '/progress' },
  { pattern: '/goals', title: 'Metas pessoais', parent: '/you' },
  { pattern: '/profile', title: 'Perfil', parent: '/you' },
  { pattern: '/profile/connect', title: 'Conectar sua IA', parent: '/profile' },
  { pattern: '/profile/tokens', title: 'Conectar sua IA', parent: '/profile' },
  { pattern: '/profile/notifications', title: 'Notificações', parent: '/profile' },
  { pattern: '/profile/appearance', title: 'Aparência', parent: '/profile' },
  // Galeria do design system: só fora de produção (notFound em produção), sem link.
  { pattern: '/design-system', title: 'Design system', parent: '/' },
  { pattern: '/plan', title: 'Meu plano', parent: '/you' },
  { pattern: '/chat', title: 'Chat', parent: '/' },
  // Só no app: na web as memórias são uma gaveta da conversa. Antes do `:id`.
  { pattern: '/chat/memories', title: 'Memórias', parent: '/chat' },
  { pattern: '/chat/:id', title: 'Chat', parent: '/' },
  { pattern: '/community', title: 'Comunidade', parent: '/' },
  // Antes de `/community/:id`: a primeira rota que casa é a que vale.
  { pattern: '/community/new', title: 'Criar comunidade', parent: '/community' },
  { pattern: '/community/:id', title: 'Comunidade', parent: '/community' },
  { pattern: '/community/:id/content', title: 'Planos e dicas', parent: '/community/:id' },
  // O mural é o próprio `/community/:id`, na web e no app; este caminho (que os
  // avisos do mural usam) só redireciona para lá.
  { pattern: '/community/:id/feed', title: 'Mural', parent: '/community/:id' },
  // O que era a tela principal da comunidade, atrás da engrenagem do mural.
  { pattern: '/community/:id/settings', title: 'Sobre a comunidade', parent: '/community/:id' },
  { pattern: '/community/:id/challenges', title: 'Desafios', parent: '/community/:id' },
  {
    pattern: '/community/:id/challenges/:challengeId',
    title: 'Desafio',
    parent: '/community/:id/challenges',
  },
  {
    pattern: '/community/:id/content/:templateId',
    title: 'Plano pronto',
    parent: '/community/:id/content',
  },
  // O painel da equipe: voltar sai do painel para a comunidade, e a seção
  // dentro dele volta à Visão geral. `:id` no `parent` é o mesmo da rota.
  { pattern: '/org/:id', title: 'Painel', parent: '/community/:id' },
  { pattern: '/org/:id/members', title: 'Membros', parent: '/org/:id' },
  { pattern: '/org/:id/members/:membershipId', title: 'Membro', parent: '/org/:id/members' },
  { pattern: '/org/:id/invites', title: 'Convites', parent: '/org/:id' },
  { pattern: '/org/:id/seats', title: 'Assentos', parent: '/org/:id' },
  { pattern: '/org/:id/settings', title: 'Configurações', parent: '/org/:id' },
  { pattern: '/org/:id/content', title: 'Planos e dicas', parent: '/org/:id' },
  {
    pattern: '/org/:id/content/plans/:templateId',
    title: 'Plano pronto',
    parent: '/org/:id/content',
  },
  { pattern: '/org/:id/content/tips/:tipId', title: 'Dica', parent: '/org/:id/content' },
  { pattern: '/org/:id/exercises', title: 'Exercícios', parent: '/org/:id' },
  { pattern: '/org/:id/exercises/:exerciseId', title: 'Exercício', parent: '/org/:id/exercises' },
  { pattern: '/org/:id/challenges', title: 'Desafios', parent: '/org/:id' },
  { pattern: '/org/:id/moderation', title: 'Moderação', parent: '/org/:id' },
  { pattern: '/org/:id/agent', title: 'Agente', parent: '/org/:id' },
  { pattern: '/students', title: 'Membros', parent: '/' },
  { pattern: '/students/:id', title: 'Membro', parent: '/students' },
];

export interface RouteInfo {
  title: string;
  /** Para onde "voltar" leva; null no Hoje. */
  parent: string | null;
  /** Título da tela de destino do "voltar" (para o rótulo acessível). */
  parentTitle: string | null;
}

function segments(path: string): string[] {
  return path.split(/[?#]/)[0]!.split('/').filter(Boolean);
}

function match(pattern: string, path: string[]): boolean {
  const p = segments(pattern);
  return p.length === path.length && p.every((seg, i) => seg.startsWith(':') || seg === path[i]);
}

function find(path: string[]): RouteDef | undefined {
  return ROUTES.find((r) => match(r.pattern, path));
}

/** O caminho é de uma tela do mapa? Os `:param` casam qualquer segmento. */
export function isKnownRoute(pathname: string): boolean {
  return find(segments(pathname)) !== undefined;
}

/** Troca os `:param` do `parent` pelos valores que a rota casou com o mesmo nome. */
function fillParams(parent: string, pattern: string, path: string[]): string {
  const valores = new Map<string, string>();
  segments(pattern).forEach((seg, i) => {
    if (seg.startsWith(':')) valores.set(seg, path[i]!);
  });
  return parent.replace(/:[^/]+/g, (param) => valores.get(param) ?? param);
}

/**
 * Título e "voltar" da tela. Rota fora do mapa volta ao ancestral conhecido
 * mais próximo (no fim, o Hoje), nunca a lugar nenhum.
 */
export function routeInfo(pathname: string): RouteInfo {
  const path = segments(pathname);
  const def = find(path);
  let parent: string | null;
  let title: string;
  if (def) {
    parent = def.parent === null ? null : fillParams(def.parent, def.pattern, path);
    title = def.title;
  } else {
    title = '';
    parent = '/';
    for (let n = path.length - 1; n > 0; n--) {
      if (find(path.slice(0, n))) {
        parent = '/' + path.slice(0, n).join('/');
        break;
      }
    }
  }
  const parentTitle = parent === null ? null : (find(segments(parent))?.title ?? HOME_TITLE);
  return { title, parent, parentTitle };
}
