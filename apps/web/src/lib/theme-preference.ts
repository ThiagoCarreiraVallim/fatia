'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  THEME_STORAGE_KEY,
  palettes,
  parseThemePreference,
  resolveTheme,
  type Theme,
  type ThemePreference,
} from '@fatia/design';

/**
 * Preferência de tema na web (ADR 041). É preferência de interface, a única
 * coisa que o docs/CLAUDE.md permite no localStorage; todo acesso tem
 * try/catch porque o armazenamento pode estar bloqueado.
 */

export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Sem armazenamento a escolha vale só nesta aba.
  }
}

function systemTheme(): Theme | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Grava no <html> o tema resolvido; devolve qual ficou. */
export function applyThemePreference(preference: ThemePreference): Theme {
  const theme = resolveTheme(preference, systemTheme());
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = theme;
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute('content', palettes[theme].background));
  return theme;
}

const THEME_EVENT = 'fatia:theme';

/**
 * O <html> é a fonte da verdade (o script do <head> já o deixou certo antes do
 * React): o hook só assina as mudanças dele e do sistema.
 */
function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia?.('(prefers-color-scheme: light)');
  const onSystem = () => {
    if (document.documentElement.dataset.themePreference === 'system') {
      applyThemePreference('system');
      onChange();
    }
  };
  window.addEventListener(THEME_EVENT, onChange);
  media?.addEventListener?.('change', onSystem);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    media?.removeEventListener?.('change', onSystem);
  };
}

function snapshot(): string {
  const d = document.documentElement.dataset;
  return `${parseThemePreference(d.themePreference)}:${d.theme === 'light' ? 'light' : 'dark'}`;
}

/** Preferência atual + troca (aplica, guarda e acompanha o sistema em "Sistema"). */
export function useThemePreference(): {
  preference: ThemePreference;
  theme: Theme;
  setPreference: (preference: ThemePreference) => void;
} {
  const value = useSyncExternalStore(subscribe, snapshot, () => 'system:dark');
  const [preference, theme] = value.split(':') as [ThemePreference, Theme];

  const setPreference = useCallback((p: ThemePreference) => {
    writeThemePreference(p);
    applyThemePreference(p);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return { preference, theme, setPreference };
}
