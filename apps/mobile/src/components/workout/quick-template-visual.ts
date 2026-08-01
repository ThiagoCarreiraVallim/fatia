import {
  Dumbbell,
  Flame,
  Footprints,
  MoveVertical,
  PersonStanding,
  Sparkles,
  Target,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';

/**
 * Visual dos treinos rápidos no app nativo.
 *
 * `QUICK_TEMPLATES` traz `gradient` (classes do Tailwind) e `image` (SVG servido
 * de `apps/web/public`). As duas coisas são do PWA: classe de gradiente não
 * existe no NativeWind com `bg-gradient-to-br`, e a imagem viria da rede — um
 * card de capa que pisca em conexão ruim, para um dado que já está no bundle.
 *
 * Aqui cada template ganha uma cor sólida e um ícone, indexados pelo mesmo `id`.
 * Template novo sem entrada cai no padrão em vez de sumir.
 */
export interface QuickVisual {
  tint: string;
  icon: LucideIcon;
}

const DEFAULT_VISUAL: QuickVisual = { tint: '#2a2a2a', icon: Dumbbell };

const QUICK_VISUALS: Record<string, QuickVisual> = {
  'full-body': { tint: '#14532d', icon: PersonStanding },
  push: { tint: '#4c1d24', icon: Dumbbell },
  pull: { tint: '#1e293b', icon: MoveVertical },
  legs: { tint: '#4a2c0a', icon: Footprints },
  upper: { tint: '#3b1d63', icon: Dumbbell },
  lower: { tint: '#0f3d3a', icon: Footprints },
  core: { tint: '#4a2a0c', icon: Target },
  hiit: { tint: '#0b3a45', icon: Zap },
  gluteos: { tint: '#4a1633', icon: Flame },
  mobilidade: { tint: '#2c3d10', icon: Sparkles },
};

export function quickVisual(id: string): QuickVisual {
  return QUICK_VISUALS[id] ?? DEFAULT_VISUAL;
}
