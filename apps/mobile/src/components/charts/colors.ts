import { cores } from '@/theme/cores';

/**
 * As cores dos gráficos. Vêm de `src/theme/cores.ts`, o lugar único dos hex do
 * tema; este nome fica porque os gráficos já o importam.
 */
export const chartColors = {
  primary: cores.primary,
  foreground: cores.foreground,
  mutedForeground: cores.mutedForeground,
  background: cores.background,
  card: cores.card,
  border: cores.border,
  destructive: cores.destructive,
} as const;
