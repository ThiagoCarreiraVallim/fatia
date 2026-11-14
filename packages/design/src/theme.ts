import type { Theme } from './tokens';

/**
 * Preferência de tema (ADR 041): Sistema, Escuro ou Claro. É preferência de
 * interface, guardada no próprio aparelho (localStorage na web, SecureStore no
 * app) — não vai para a conta.
 */
export const THEME_PREFERENCES = ['system', 'dark', 'light'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

/** Chave única nos dois clientes. */
export const THEME_STORAGE_KEY = 'fatia.theme';

export const THEME_PREFERENCE_LABELS: Record<ThemePreference, string> = {
  system: 'Sistema',
  dark: 'Escuro',
  light: 'Claro',
};

/** Valor guardado (ou ausente, ou corrompido) → preferência válida. */
export function parseThemePreference(value: unknown): ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
    ? (value as ThemePreference)
    : DEFAULT_THEME_PREFERENCE;
}

/**
 * O tema que vale agora. Sem resposta do sistema, o escuro — o tema de sempre
 * do Fatia.
 */
export function resolveTheme(preference: ThemePreference, system: Theme | null | undefined): Theme {
  if (preference === 'system') return system ?? 'dark';
  return preference;
}
