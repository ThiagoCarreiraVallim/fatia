import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { usePathname, useRouter } from 'expo-router';
import { colorScheme, useColorScheme } from 'nativewind';
import type { Theme, ThemePreference } from '@fatia/design';
import { setColorsTheme, themeColors } from './colors';
import { readThemePreference, writeThemePreference } from './theme-preference';

/**
 * Tema do app (ADR 041).
 *
 * - A preferência (Sistema/Escuro/Claro) vai para o `colorScheme` do NativeWind,
 *   que troca as variáveis do `global.css` e responde ao sistema em "Sistema".
 * - As cores em JS (`colors`) leem o tema resolvido por `setColorsTheme`.
 *   Componente que passa `colors.x` numa prop só repinta quando renderiza de
 *   novo; por isso a árvore abaixo daqui remonta (`key`) quando o tema muda, e
 *   a tela atual é reaberta pelo caminho, para a pessoa não perder o lugar.
 * - Barra de status e fundo do sistema (área atrás do teclado, da barra de
 *   navegação do Android) seguem o tema.
 */

interface ThemeContextValue {
  preference: ThemePreference;
  theme: Theme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme fora do ThemeProvider');
  return ctx;
}

export function ThemeProvider({
  initialPreference,
  children,
}: {
  initialPreference: ThemePreference;
  children: ReactNode;
}) {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [preference, setPreferenceState] = useState(initialPreference);
  const theme: Theme = colorScheme === 'light' ? 'light' : 'dark';
  // Antes do primeiro render dos filhos: eles leem `colors` já no tema certo.
  setColorsTheme(theme);

  const pathname = usePathname();
  const router = useRouter();
  const [renderedTheme, setRenderedTheme] = useState(theme);

  useEffect(() => {
    setColorScheme(preference);
  }, [preference, setColorScheme]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(themeColors[theme].background);
    if (theme === renderedTheme) return;
    // Remontou com o tema novo: volta para a tela em que a pessoa estava.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marca qual tema já foi aplicado à árvore
    setRenderedTheme(theme);
    if (pathname && pathname !== '/') router.replace(pathname as never);
  }, [theme, renderedTheme, pathname, router]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    void writeThemePreference(p);
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, theme, setPreference }}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <ThemeTree key={theme}>{children}</ThemeTree>
    </ThemeContext.Provider>
  );
}

function ThemeTree({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** Lê a preferência guardada antes de montar o app (a splash fica na frente). */
export function useStoredThemePreference(): ThemePreference | null {
  const [preference, setPreference] = useState<ThemePreference | null>(null);
  useEffect(() => {
    let alive = true;
    void readThemePreference().then((p) => {
      if (!alive) return;
      // Aplica antes do primeiro render das telas: abrir já no tema certo, sem
      // remontar nem piscar.
      colorScheme.set(p);
      setPreference(p);
    });
    return () => {
      alive = false;
    };
  }, []);
  return preference;
}
