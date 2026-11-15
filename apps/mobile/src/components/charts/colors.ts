import { colors } from '@/theme/colors';

/**
 * As cores dos gráficos. Vêm de `src/theme/colors.ts`, o lugar único dos hex do
 * tema; este nome fica porque os gráficos já o importam. São getters: leem o
 * tema que vale na hora do render, não o de quando o módulo carregou.
 */
export const chartColors = {
  get primary() {
    return colors.primary;
  },
  get foreground() {
    return colors.foreground;
  },
  get mutedForeground() {
    return colors.mutedForeground;
  },
  get background() {
    return colors.background;
  },
  get card() {
    return colors.card;
  },
  get border() {
    return colors.border;
  },
  get destructive() {
    return colors.destructive;
  },
} as const;
