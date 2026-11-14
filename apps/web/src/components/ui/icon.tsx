import * as React from 'react';
import {
  Apple,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Calendar,
  CalendarCheck,
  Camera,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Crown,
  Download,
  Droplet,
  Dumbbell,
  Ellipsis,
  Eye,
  FileText,
  Flame,
  Footprints,
  Funnel,
  Gift,
  Heart,
  House,
  Image,
  Info,
  Layers,
  LayoutGrid,
  Link,
  List,
  Lock,
  LogOut,
  MapPin,
  Medal,
  Megaphone,
  MessageCircle,
  Mic,
  Moon,
  Palette,
  Pause,
  Pencil,
  PersonStanding,
  Play,
  Plus,
  QrCode,
  Repeat,
  Ruler,
  ScanLine,
  Search,
  Send,
  Settings,
  Share2,
  Shield,
  ShoppingCart,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Target,
  Timer,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Trophy,
  User,
  UserX,
  Users,
  Weight,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { CUSTOM_ICONS, ICON_SIZE, ICON_STROKE, type IconName } from '@fatia/design';
import { cn } from '@/lib/utils';

/**
 * Ícone do design system pelo nome do canvas (mapa em `@fatia/design/icons`).
 *
 * Os imports são um a um, e não `import *`, para o bundle levar só os 75
 * ícones do mapa; o `Record<IconName, …>` obriga a cobrir todos, e o teste
 * confere que cada um é o ícone do mapa.
 */
export const ICON_COMPONENTS: Record<IconName, LucideIcon | 'custom'> = {
  alert: TriangleAlert,
  apple: Apple,
  arrowR: ArrowRight,
  arrowUR: ArrowUpRight,
  bell: Bell,
  body: PersonStanding,
  bolt: Zap,
  book: BookOpen,
  cal: Calendar,
  camera: Camera,
  cart: ShoppingCart,
  chart: ChartColumn,
  chat: MessageCircle,
  check: Check,
  chevD: ChevronDown,
  chevL: ChevronLeft,
  chevR: ChevronRight,
  clock: Clock,
  crown: Crown,
  download: Download,
  drop: Droplet,
  dumbbell: Dumbbell,
  edit: Pencil,
  eye: Eye,
  file: FileText,
  filter: Funnel,
  flame: Flame,
  gear: Settings,
  gift: Gift,
  grid: LayoutGrid,
  habit: CalendarCheck,
  heart: Heart,
  home: House,
  image: Image,
  info: Info,
  layers: Layers,
  link: Link,
  list: List,
  lock: Lock,
  logout: LogOut,
  medal: Medal,
  mega: Megaphone,
  mic: Mic,
  moon: Moon,
  more: Ellipsis,
  palette: Palette,
  pause: Pause,
  phone: Smartphone,
  pin: MapPin,
  play: Play,
  plus: Plus,
  qr: QrCode,
  repeat: Repeat,
  review: ClipboardCheck,
  ruler: Ruler,
  scale: Weight,
  scan: ScanLine,
  search: Search,
  send: Send,
  share: Share2,
  shield: Shield,
  sliders: SlidersHorizontal,
  spark: Sparkles,
  star: Star,
  steps: Footprints,
  sun: Sun,
  target: Target,
  timer: Timer,
  trash: Trash2,
  trend: TrendingUp,
  trophy: Trophy,
  user: User,
  users: Users,
  userx: UserX,
  whats: 'custom',
  x: X,
};

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'ref'> {
  name: IconName;
  size?: number;
  /**
   * Nome para o leitor de tela. Sem ele o ícone é decorativo (`aria-hidden`):
   * quem dá nome é o texto ao lado ou o `aria-label` do botão.
   */
  label?: string;
}

/** Traço 1,8, 24 px, cor herdada do texto (`currentColor`). */
export function Icon({ name, size = ICON_SIZE, label, className, ...props }: IconProps) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  const Component = ICON_COMPONENTS[name];
  if (Component === 'custom') {
    const custom = (CUSTOM_ICONS as Record<string, { paths: readonly string[] }>)[name];
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn('shrink-0', className)}
        {...a11y}
        {...props}
      >
        {custom?.paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  }
  return (
    <Component
      size={size}
      strokeWidth={ICON_STROKE}
      className={cn('shrink-0', className)}
      {...a11y}
      {...props}
    />
  );
}
