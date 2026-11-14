/**
 * Ícones do design system: o nome do canvas (`.i-<nome>`) → o ícone do lucide.
 *
 * Traço 1,8, 24 px, cor herdada do texto. Os dois clientes têm um `Icon` que lê
 * este mapa (apps/web/src/components/ui/icon.tsx e
 * apps/mobile/src/components/ui/icon.tsx); o site usa o mesmo nome em kebab
 * pelo `astro-icon` (`lucide:<kebab>`), via {@link lucideKebab}.
 *
 * O WhatsApp é marca de terceiro e não existe no lucide: vira desenho próprio
 * ({@link CUSTOM_ICONS}), no mesmo traço.
 */
export const ICONS = {
  alert: 'TriangleAlert',
  apple: 'Apple',
  arrowR: 'ArrowRight',
  arrowUR: 'ArrowUpRight',
  bell: 'Bell',
  body: 'PersonStanding',
  bolt: 'Zap',
  book: 'BookOpen',
  cal: 'Calendar',
  camera: 'Camera',
  cart: 'ShoppingCart',
  chart: 'ChartColumn',
  chat: 'MessageCircle',
  check: 'Check',
  chevD: 'ChevronDown',
  chevL: 'ChevronLeft',
  chevR: 'ChevronRight',
  clock: 'Clock',
  crown: 'Crown',
  download: 'Download',
  drop: 'Droplet',
  dumbbell: 'Dumbbell',
  edit: 'Pencil',
  eye: 'Eye',
  file: 'FileText',
  filter: 'Funnel',
  flame: 'Flame',
  gear: 'Settings',
  gift: 'Gift',
  grid: 'LayoutGrid',
  habit: 'CalendarCheck',
  heart: 'Heart',
  home: 'House',
  image: 'Image',
  info: 'Info',
  layers: 'Layers',
  link: 'Link',
  list: 'List',
  lock: 'Lock',
  logout: 'LogOut',
  medal: 'Medal',
  mega: 'Megaphone',
  mic: 'Mic',
  moon: 'Moon',
  more: 'Ellipsis',
  palette: 'Palette',
  pause: 'Pause',
  phone: 'Smartphone',
  pin: 'MapPin',
  play: 'Play',
  plus: 'Plus',
  qr: 'QrCode',
  repeat: 'Repeat',
  review: 'ClipboardCheck',
  ruler: 'Ruler',
  scale: 'Weight',
  scan: 'ScanLine',
  search: 'Search',
  send: 'Send',
  share: 'Share2',
  shield: 'Shield',
  sliders: 'SlidersHorizontal',
  spark: 'Sparkles',
  star: 'Star',
  steps: 'Footprints',
  sun: 'Sun',
  target: 'Target',
  timer: 'Timer',
  trash: 'Trash2',
  trend: 'TrendingUp',
  trophy: 'Trophy',
  user: 'User',
  users: 'Users',
  userx: 'UserX',
  whats: 'custom:whats',
  x: 'X',
} as const;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/** Desenhos próprios, em 24×24, traço (sem preenchimento). */
export const CUSTOM_ICONS = {
  whats: {
    paths: [
      'M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21',
      'M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1',
    ],
  },
} as const satisfies Partial<Record<IconName, { paths: readonly string[] }>>;

export const ICON_STROKE = 1.8;
export const ICON_SIZE = 24;

/** `ArrowUpRight` → `arrow-up-right` (o nome do conjunto `lucide` do Iconify). */
export function lucideKebab(name: IconName): string | null {
  const target = ICONS[name];
  if (target.startsWith('custom:')) return null;
  return target
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}
