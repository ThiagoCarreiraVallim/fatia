import {
  ClipboardList,
  Crown,
  Flag,
  FlaskConical,
  History,
  MessageCircle,
  Plug,
  Target,
  TrendingUp,
  Trophy,
  User,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import type { MenuIcon } from '@fatia/api-client';

export const MENU_ICON: Record<MenuIcon, LucideIcon> = {
  progress: TrendingUp,
  records: Trophy,
  'daily-goals': Target,
  'personal-goals': Flag,
  profile: User,
  foods: UtensilsCrossed,
  nutrients: FlaskConical,
  plans: ClipboardList,
  history: History,
  chat: MessageCircle,
  connect: Plug,
  plan: Crown,
};
