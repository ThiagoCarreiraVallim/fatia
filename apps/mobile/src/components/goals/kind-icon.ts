import {
  Dumbbell,
  Flame,
  Footprints,
  Scale,
  Sparkles,
  type LucideIcon,
} from 'lucide-react-native';
import type { GoalKind } from '@fatia/api-client';

/** Mesmo mapa do PWA (`KIND_ICON` em `app/(app)/goals/page.tsx`). */
export const KIND_ICON: Record<GoalKind, LucideIcon> = {
  weight: Scale,
  body_fat: Flame,
  workout_frequency: Dumbbell,
  step_count: Footprints,
  custom: Sparkles,
};
