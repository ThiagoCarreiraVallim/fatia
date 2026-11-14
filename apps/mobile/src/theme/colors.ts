import { palettes, type Theme } from '@fatia/design';

/**
 * Os tokens em hex, para as props do React Native que não aceitam `className`:
 * `color` de ícone, `placeholderTextColor`, `stroke`/`fill` do SVG,
 * `ActivityIndicator`.
 *
 * Os valores vêm de `@fatia/design` (a mesma fonte do `global.css`), por tema.
 * `colors.x` é um getter: lê o tema que está valendo agora
 * ({@link setColorsTheme}, chamado pela preferência de tema). Por isso
 * **nunca** copie `colors.x` para uma constante de módulo — ela congelaria o
 * tema de quando o arquivo carregou. Leia dentro do componente.
 *
 * O teste `__tests__/colors.test.ts` confere os dois temas contra o HSL de cada
 * bloco do `global.css`.
 */

function build(theme: Theme) {
  const p = palettes[theme];
  return {
    background: p.background,
    foreground: p.foreground,
    card: p.card,
    muted: p.muted,
    mutedForeground: p['muted-foreground'],
    faintForeground: p['faint-foreground'],
    surface3: p['surface-3'],
    /** Verde da marca como superfície (fundo de botão, anel). */
    primary: p.primary,
    /** Verde que pode ser texto ou ícone sobre o fundo (no claro, #1A7F00). */
    primaryText: p['primary-text'],
    primaryForeground: p['primary-foreground'],
    border: p.border,
    borderStrong: p['border-strong'],
    destructive: p.destructive,
    danger: p.danger,
    success: p.success,
    warning: p.warning,
    info: p.info,
    kcal: p.kcal,
    protein: p.protein,
    carbs: p.carbs,
    fat: p.fat,
    water: p.water,
    steps: p.steps,
    brand: p.brand,
    brandForeground: p['brand-foreground'],
    /** Texto de exemplo dos campos. Não é token do tema: só existe no nativo. */
    placeholder: theme === 'dark' ? '#8a8a8a' : p['faint-foreground'],
  };
}

export type ColorPalette = ReturnType<typeof build>;
export type ColorName = keyof ColorPalette;

export const themeColors: Record<Theme, ColorPalette> = {
  dark: build('dark'),
  light: build('light'),
};

let current: Theme = 'dark';

/** Troca o tema que `colors` lê. Quem chama também troca o do NativeWind. */
export function setColorsTheme(theme: Theme): void {
  current = theme;
}

export function getColorsTheme(): Theme {
  return current;
}

export const colors = {} as ColorPalette;
for (const name of Object.keys(themeColors.dark) as ColorName[]) {
  Object.defineProperty(colors, name, {
    enumerable: true,
    get: () => themeColors[current][name],
  });
}
