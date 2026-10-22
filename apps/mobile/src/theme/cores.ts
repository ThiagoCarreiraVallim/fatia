/**
 * Os tokens de `global.css` em hex, para as props do React Native que não
 * aceitam `className`: `color` de ícone, `placeholderTextColor`, `stroke`/`fill`
 * do SVG, `ActivityIndicator`.
 *
 * O teste `__tests__/cores.test.ts` confere cada valor contra o HSL do
 * `global.css`; trocar a cor num lado sem o outro quebra ali.
 */
export const cores = {
  background: '#131313',
  foreground: '#e5e2e1',
  card: '#2a2a2a',
  muted: '#1f1f1f',
  mutedForeground: '#baccaf',
  primary: '#2ce500',
  primaryForeground: '#131313',
  border: '#333333',
  destructive: '#93000a',
  danger: '#fb7185',
  success: '#10b981',
  warning: '#fbbf24',
  protein: '#4b8eff',
  carbs: '#2ce500',
  fat: '#ffb4ab',
  water: '#60a5fa',
  /** Texto de exemplo dos campos. Não é token do tema: só existe no nativo. */
  placeholder: '#8a8a8a',
} as const;

export type Cor = keyof typeof cores;
