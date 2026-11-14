import type { ComponentType } from 'react';
import Svg, { Path } from 'react-native-svg';
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
} from 'lucide-react-native';
import { CUSTOM_ICONS, ICON_SIZE, ICON_STROKE, type IconName } from '@fatia/design';
import { colors } from '@/theme/colors';

type LucideIcon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/**
 * Ícone do design system pelo nome do canvas (mapa em `@fatia/design/icons`),
 * o mesmo da web (`apps/web/src/components/ui/icon.tsx`). O `Record<IconName,
 * …>` obriga a cobrir todos os nomes; o teste do pacote confere que cada ícone
 * do mapa existe no `lucide-react-native` instalado.
 *
 * Sem `label` o ícone é decorativo (escondido do leitor de tela); a cor padrão
 * é a do texto no tema atual, lida no render.
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

export function Icon({
  name,
  size = ICON_SIZE,
  color,
  label,
}: {
  name: IconName;
  size?: number;
  color?: string;
  label?: string;
}) {
  const stroke = color ?? colors.foreground;
  const a11y = label
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label }
    : { accessible: false, importantForAccessibility: 'no-hide-descendants' as const };
  const Component = ICON_COMPONENTS[name];
  if (Component === 'custom') {
    const custom = (CUSTOM_ICONS as Record<string, { paths: readonly string[] }>)[name];
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...a11y}
      >
        {custom?.paths.map((d) => (
          <Path key={d} d={d} />
        ))}
      </Svg>
    );
  }
  return <Component size={size} color={stroke} strokeWidth={ICON_STROKE} {...a11y} />;
}
