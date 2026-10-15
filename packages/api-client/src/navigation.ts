/**
 * Navegação comum ao PWA e ao app: a mesma barra e o mesmo menu nas duas pontas.
 *
 * Barra de baixo: Início · Nutrição · [ + ] · Treino · Mais. O "+" é o
 * Registrar (`quick-add.ts`); "Mais" abre o menu com todas as outras telas,
 * em seções. No desktop do PWA a barra lateral mostra tudo de uma vez.
 */

export type NavPlatform = 'web' | 'mobile';
export type NavKey = 'home' | 'nutrition' | 'workout' | 'more';

export interface NavTab {
  key: Exclude<NavKey, 'more'>;
  label: string;
  href: string;
}

export const PRIMARY_TABS: NavTab[] = [
  { key: 'home', label: 'Início', href: '/' },
  { key: 'nutrition', label: 'Nutrição', href: '/nutrition' },
  { key: 'workout', label: 'Treino', href: '/workout' },
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
  | 'connect';

export interface MenuItem {
  key: MenuIcon;
  label: string;
  description: string;
  href: string;
}

interface MenuItemDef extends Omit<MenuItem, 'href'> {
  href: string | Record<NavPlatform, string>;
  /** Ausente = as duas pontas. */
  platforms?: NavPlatform[];
  /** Só aparece quando a IA hospedada está disponível (na Fase 4, quando o plano a inclui). */
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
    ],
  },
];

export function menuSections(opts: {
  platform: NavPlatform;
  chatAvailable: boolean;
}): MenuSection[] {
  return MENU.map((section) => ({
    title: section.title,
    items: section.items
      .filter((item) => !item.platforms || item.platforms.includes(opts.platform))
      .filter((item) => item.requires !== 'chat' || opts.chatAvailable)
      .map(({ platforms: _p, requires: _r, ...item }) => ({
        ...item,
        href: typeof item.href === 'string' ? item.href : item.href[opts.platform],
      })),
  })).filter((section) => section.items.length > 0);
}

/**
 * Aba acesa para a rota. Nutrição e Treino acendem em toda a subárvore (Meus
 * alimentos é Nutrição, Planos é Treino); o resto — Progresso, Metas, Perfil,
 * Chat — mora no "Mais".
 */
export function activeNavKey(pathname: string): NavKey {
  if (pathname === '/') return 'home';
  if (/^\/nutrition(\/|$)/.test(pathname)) return 'nutrition';
  if (/^\/workout(\/|$)/.test(pathname)) return 'workout';
  return 'more';
}
