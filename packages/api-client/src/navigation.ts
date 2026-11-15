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

/**
 * O que cada linha de Você faz: `link` abre uma tela; `toggle` liga e desliga
 * ali mesmo ("Guardar fotos das refeições"); `action` dispara uma ação (trocar
 * a senha, exportar os dados). A tela decide o que cada `key` faz.
 */
export type MenuItemKind = 'link' | 'toggle' | 'action';

export type MenuKey =
  | 'progress'
  | 'personal-goals'
  | 'records'
  | 'nutrition-plan'
  | 'daily-goals'
  | 'nutrients'
  | 'foods'
  | 'plans'
  | 'history'
  | 'chat'
  | 'connect'
  | 'communities'
  | 'notifications'
  | 'reminders'
  | 'plan'
  | 'keep-photos'
  | 'units'
  | 'appearance'
  | 'news'
  | 'help'
  | 'password'
  | 'export';

export interface MenuItem {
  key: MenuKey;
  label: string;
  /** Nome do ícone do design system (`@fatia/design`, `ICONS`). */
  icon: string;
  kind: MenuItemKind;
  /** Só nas linhas `link`. */
  href: string | null;
  /** Texto fixo à direita ou embaixo ("Claude, ChatGPT", "Arquivo com link, vale 24 h"). */
  detail?: string;
  /** Função do plano PRO que esta pessoa não tem: mostra cadeado e leva ao plano. */
  locked?: boolean;
}

interface MenuItemDef extends Omit<MenuItem, 'href'> {
  href: string | Record<NavPlatform, string> | null;
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

const link = (
  key: MenuKey,
  label: string,
  icon: string,
  href: MenuItemDef['href'],
  extra: Partial<MenuItemDef> = {},
): MenuItemDef => ({ key, label, icon, kind: 'link', href, ...extra });

/**
 * As seções de Você, na ordem da prancha `Al-V1-Voce` (ADR 040, item 3). Só
 * entram as linhas cujo destino existe: Sua semana e cards, Avaliações,
 * Conquistas, Configurações da IA, Hábitos, Lembretes, a saúde do celular e
 * Objetivo e rotina chegam com as issues donas das telas (#382, #383, #385,
 * #389, #390, #371). Aparência fica em Conta pela ADR 041 e pela revisão da
 * ADR 040, mesmo sem estar desenhada na prancha.
 */
const MENU: { title: string; items: MenuItemDef[] }[] = [
  {
    title: 'Progresso',
    items: [
      link('progress', 'Progresso', 'trend', '/progress'),
      link('personal-goals', 'Metas pessoais', 'target', '/goals'),
      link('records', 'Recordes', 'trophy', '/progress/records'),
    ],
  },
  {
    title: 'Nutrição',
    items: [
      link('nutrition-plan', 'Plano alimentar', 'apple', '/nutrition/plan'),
      link('daily-goals', 'Metas do dia', 'target', '/nutrition/goals'),
      link('nutrients', 'Metas de nutrientes', 'apple', '/nutrition/nutrient-targets'),
      link('foods', 'Meus alimentos', 'apple', '/nutrition/foods'),
    ],
  },
  {
    title: 'Treino',
    items: [
      link('plans', 'Planos de treino', 'dumbbell', '/workout/plans'),
      link('history', 'Histórico', 'clock', '/workout/history'),
    ],
  },
  {
    title: 'IA',
    items: [
      link('chat', 'Conversas', 'chat', '/chat', { requires: 'chat' }),
      link(
        'connect',
        'Conectar sua IA',
        'link',
        { web: '/profile/connect', mobile: '/profile/tokens' },
        { detail: 'Claude, ChatGPT' },
      ),
    ],
  },
  {
    title: 'Comunidade e equipe',
    items: [link('communities', 'Comunidades e o que compartilho', 'users', '/community')],
  },
  {
    title: 'Rotina e avisos',
    items: [
      // Os avisos são linhas de Você, não um sino no cabeçalho dela (ADR 040,
      // item 4). Lembretes (prancha Al-V2, #389) vêm antes das notificações.
      link('reminders', 'Lembretes', 'bell', '/you/reminders'),
      link('notifications', 'Notificações', 'phone', '/profile/notifications'),
    ],
  },
  {
    title: 'Conta',
    items: [
      link('plan', 'Meu plano', 'crown', '/plan'),
      {
        key: 'keep-photos',
        label: 'Guardar fotos das refeições',
        icon: 'image',
        kind: 'toggle',
        href: null,
      },
      link('units', 'Unidades', 'ruler', '/you/units'),
      link('appearance', 'Aparência', 'palette', '/profile/appearance'),
      link('news', 'Novidades', 'gift', '/you/news'),
      link('help', 'Ajuda e tutoriais', 'book', '/you/help'),
      { key: 'password', label: 'Trocar senha', icon: 'lock', kind: 'action', href: null },
      {
        key: 'export',
        label: 'Exportar meus dados',
        icon: 'download',
        kind: 'action',
        href: null,
        detail: 'Arquivo com link, vale 24 h',
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
        const href =
          item.href === null || typeof item.href === 'string'
            ? item.href
            : item.href[opts.platform];
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
  /** null nas 5 abas da barra (ADR 040): são telas de ver, sem seta de voltar. */
  parent: string | null;
}

export const HOME_TITLE = 'Hoje';

/**
 * Todas as telas do PWA e do app. Telas dinâmicas têm título genérico; a
 * própria tela troca pelo nome (plano, conversa, comunidade) quando carrega.
 */
export const ROUTES: readonly RouteDef[] = [
  { pattern: '/', title: HOME_TITLE, parent: null },
  { pattern: '/nutrition', title: 'Nutrição', parent: null },
  { pattern: '/nutrition/foods', title: 'Meus alimentos', parent: '/nutrition' },
  { pattern: '/nutrition/goals', title: 'Metas do dia', parent: '/nutrition' },
  { pattern: '/nutrition/nutrient-targets', title: 'Metas de nutrientes', parent: '/nutrition' },
  { pattern: '/nutrition/plan', title: 'Plano alimentar', parent: '/nutrition' },
  { pattern: '/nutrition/scan', title: 'Escanear produto', parent: '/nutrition' },
  { pattern: '/nutrition/photo', title: 'Registrar por foto', parent: '/nutrition' },
  { pattern: '/workout', title: 'Treino', parent: null },
  { pattern: '/workout/history', title: 'Histórico de treino', parent: '/workout' },
  { pattern: '/workout/plans', title: 'Planos de treino', parent: '/workout' },
  { pattern: '/workout/plans/:id', title: 'Plano de treino', parent: '/workout/plans' },
  { pattern: '/workout/quick/:id', title: 'Treino rápido', parent: '/workout' },
  { pattern: '/workout/session/:id', title: 'Treino', parent: '/workout/history' },
  // Você: a quinta aba. Perfil, Progresso, Metas pessoais e Meu plano são dela.
  { pattern: '/you', title: 'Você', parent: null },
  { pattern: '/you/edit', title: 'Editar perfil', parent: '/you' },
  { pattern: '/you/units', title: 'Unidades', parent: '/you' },
  { pattern: '/you/reminders', title: 'Lembretes', parent: '/you' },
  { pattern: '/you/news', title: 'Novidades', parent: '/you' },
  { pattern: '/you/help', title: 'Ajuda e tutoriais', parent: '/you' },
  { pattern: '/you/delete', title: 'Apagar conta', parent: '/you' },
  { pattern: '/progress', title: 'Progresso', parent: '/you' },
  { pattern: '/progress/records', title: 'Recordes', parent: '/progress' },
  { pattern: '/goals', title: 'Metas pessoais', parent: '/you' },
  // O perfil virou Você (#387): `/profile` só redireciona para lá.
  { pattern: '/profile', title: 'Perfil', parent: '/you' },
  { pattern: '/profile/connect', title: 'Conectar sua IA', parent: '/you' },
  { pattern: '/profile/tokens', title: 'Conectar sua IA', parent: '/you' },
  { pattern: '/profile/notifications', title: 'Notificações', parent: '/you' },
  { pattern: '/profile/appearance', title: 'Aparência', parent: '/you' },
  // Galeria do design system: só fora de produção (notFound em produção), sem link.
  { pattern: '/design-system', title: 'Design system', parent: '/' },
  { pattern: '/plan', title: 'Meu plano', parent: '/you' },
  { pattern: '/chat', title: 'Chat', parent: '/' },
  // Só no app: na web as memórias são uma gaveta da conversa. Antes do `:id`.
  { pattern: '/chat/memories', title: 'Memórias', parent: '/chat' },
  { pattern: '/chat/:id', title: 'Chat', parent: '/' },
  { pattern: '/community', title: 'Comunidade', parent: null },
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

/**
 * Barra de topo (título e ações da tela): todas as telas menos o Hoje, que tem
 * cabeçalho próprio. A seta de voltar é outra coisa: só aparece com `parent`.
 */
export function hasTopBar(pathname: string): boolean {
  return segments(pathname).length > 0;
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
