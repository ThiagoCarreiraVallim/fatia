/**
 * Navegação comum ao PWA e ao app: a mesma barra e o mesmo menu nas duas pontas.
 *
 * Barra de baixo: Nutrição · Treino · [ + ] · Comunidade · Mais. O "+" é o
 * Registrar (`quick-add.ts`); "Mais" abre o menu com todas as outras telas,
 * em seções. No desktop do PWA a barra lateral mostra tudo de uma vez.
 *
 * O Início não é aba: é a raiz. Toda outra tela tem a barra de topo com
 * "voltar" e o título pequeno, como no iOS, e voltar sobe pelo mapa de rotas
 * (`ROUTES`) até o Início — não pelo histórico, então um link aberto direto
 * também volta pelo caminho certo.
 */

export type NavPlatform = 'web' | 'mobile';
export type NavKey = 'home' | 'nutrition' | 'workout' | 'community' | 'more';

export interface NavTab {
  key: Exclude<NavKey, 'home' | 'more'>;
  label: string;
  href: string;
}

export const PRIMARY_TABS: NavTab[] = [
  { key: 'nutrition', label: 'Nutrição', href: '/nutrition' },
  { key: 'workout', label: 'Treino', href: '/workout' },
  { key: 'community', label: 'Comunidade', href: '/community' },
];

export type MenuIcon =
  | 'progress'
  | 'records'
  | 'daily-goals'
  | 'personal-goals'
  | 'profile'
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
        platforms: ['web'],
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
 * Aba acesa para a rota. Nutrição, Treino e Comunidade acendem em toda a
 * subárvore (Meus alimentos é Nutrição, Planos é Treino); o Início não acende
 * aba nenhuma, e o resto — Progresso, Metas, Perfil, Chat — mora no "Mais".
 */
export function activeNavKey(pathname: string): NavKey {
  if (pathname === '/') return 'home';
  if (/^\/nutrition(\/|$)/.test(pathname)) return 'nutrition';
  if (/^\/workout(\/|$)/.test(pathname)) return 'workout';
  if (/^\/community(\/|$)/.test(pathname)) return 'community';
  return 'more';
}

/** Uma tela no mapa: o título pequeno da barra de topo e para onde "voltar" leva. */
interface RouteDef {
  /** Segmentos com `:param` para os dinâmicos. */
  pattern: string;
  title: string;
  /** null só no Início. */
  parent: string | null;
}

export const HOME_TITLE = 'Início';

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
  { pattern: '/progress', title: 'Progresso', parent: '/' },
  { pattern: '/progress/records', title: 'Recordes', parent: '/progress' },
  { pattern: '/goals', title: 'Metas pessoais', parent: '/' },
  { pattern: '/profile', title: 'Perfil', parent: '/' },
  { pattern: '/profile/connect', title: 'Conectar sua IA', parent: '/profile' },
  { pattern: '/profile/tokens', title: 'Conectar sua IA', parent: '/profile' },
  { pattern: '/plan', title: 'Meu plano', parent: '/profile' },
  { pattern: '/chat', title: 'Chat', parent: '/' },
  { pattern: '/chat/:id', title: 'Chat', parent: '/' },
  { pattern: '/community', title: 'Comunidade', parent: '/' },
  // Antes de `/community/:id`: a primeira rota que casa é a que vale.
  { pattern: '/community/new', title: 'Criar comunidade', parent: '/community' },
  { pattern: '/community/:id', title: 'Comunidade', parent: '/community' },
  { pattern: '/community/:id/content', title: 'Planos e dicas', parent: '/community/:id' },
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
  { pattern: '/students', title: 'Membros', parent: '/' },
  { pattern: '/students/:id', title: 'Membro', parent: '/students' },
];

export interface RouteInfo {
  title: string;
  /** Para onde "voltar" leva; null no Início. */
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
 * mais próximo (no fim, o Início), nunca a lugar nenhum.
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
